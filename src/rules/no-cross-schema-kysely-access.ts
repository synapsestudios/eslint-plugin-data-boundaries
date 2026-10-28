import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { extractModuleFromPath } from '../utils/schema-parser';
import {
  extractSqlFromTemplate,
  extractTableNames,
  isSqlTaggedTemplate,
  isTableAccessViolation,
} from '../utils/sql-template';

interface RuleOptions {
  modulePath: string;
}

// Query-builder methods whose first argument names a table, or an array of them.
const TABLE_METHODS = new Set([
  'selectFrom',
  'insertInto',
  'replaceInto',
  'updateTable',
  'deleteFrom',
  'mergeInto',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'crossJoin',
  'innerJoinLateral',
  'leftJoinLateral',
  'crossJoinLateral',
  'using',
]);

interface TableReference {
  node: TSESTree.StringLiteral;
  schema?: string;
  table: string;
}

function calledMethodName(node: TSESTree.CallExpression): string | undefined {
  const { callee } = node;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return undefined;
}

function isStringLiteral(node: TSESTree.Node | null | undefined): node is TSESTree.StringLiteral {
  return node?.type === 'Literal' && typeof node.value === 'string';
}

function tableReferences(argument: TSESTree.Node | undefined): TableReference[] {
  const candidates = argument?.type === 'ArrayExpression' ? argument.elements : [argument];
  return candidates.filter(isStringLiteral).map(parseTableReference);
}

// 'schema.table as alias', 'table as alias', 'schema.table' or 'table'
function parseTableReference(node: TSESTree.StringLiteral): TableReference {
  const [name] = node.value.trim().split(/\s+as\s+/i);
  const [first, second] = name.split('.', 2);
  return second === undefined ? { node, table: first } : { node, schema: first, table: second };
}

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/synapsestudios/eslint-plugin-data-boundaries#${name}`
);

const rule = createRule<
  [RuleOptions],
  'foreignSchema' | 'crossSchemaAccess' | 'nonLiteralSchema' | 'unqualifiedTable'
>({
  name: 'no-cross-schema-kysely-access',
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow Kysely queries from reaching another module's schema",
    },
    schema: [
      {
        type: 'object',
        properties: {
          modulePath: {
            type: 'string',
            description: 'Path pattern to match module directories (e.g., "/modules/")',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      foreignSchema:
        "Module '{{currentModule}}' cannot use schema '{{schema}}'. Queries stay in the module's own schema ('{{currentModule}}').",
      crossSchemaAccess:
        "Module '{{currentModule}}' cannot access table '{{table}}' in schema '{{schema}}'. Queries stay in the module's own schema ('{{currentModule}}').",
      unqualifiedTable:
        "Module '{{currentModule}}' must name the schema in raw SQL, which withSchema doesn't scope. Use '{{currentModule}}.{{table}}' instead of '{{table}}'.",
      nonLiteralSchema:
        "Module '{{currentModule}}' must pass withSchema its own schema as a string literal ('{{currentModule}}'), so the schema can be checked.",
    },
  },
  defaultOptions: [{ modulePath: '/modules/' }],
  create(context, [options]) {
    const currentModule = extractModuleFromPath(context.filename, options.modulePath);
    if (!currentModule) {
      return {};
    }

    const reportSchemaArgument = (node: TSESTree.CallExpression): void => {
      const [schemaArgument] = node.arguments;
      if (!isStringLiteral(schemaArgument)) {
        context.report({ node, messageId: 'nonLiteralSchema', data: { currentModule } });
      } else if (schemaArgument.value !== currentModule) {
        context.report({
          node: schemaArgument,
          messageId: 'foreignSchema',
          data: { currentModule, schema: schemaArgument.value },
        });
      }
    };

    const reportTableReferences = (node: TSESTree.CallExpression): void => {
      tableReferences(node.arguments[0])
        .filter(({ schema }) => schema !== undefined && schema !== currentModule)
        .forEach(({ node: tableNode, schema, table }) =>
          context.report({
            node: tableNode,
            messageId: 'crossSchemaAccess',
            data: { currentModule, schema, table },
          })
        );
    };

    const reportRawSql = (node: TSESTree.TaggedTemplateExpression): void => {
      extractTableNames(extractSqlFromTemplate(node))
        .map((tableName) => isTableAccessViolation(tableName, currentModule))
        .forEach((violation) => {
          if (violation.isViolation && violation.reason === 'crossSchema') {
            const { schema, table } = violation;
            context.report({
              node,
              messageId: 'crossSchemaAccess',
              data: { currentModule, schema, table },
            });
          } else if (violation.isViolation) {
            const { table } = violation;
            context.report({ node, messageId: 'unqualifiedTable', data: { currentModule, table } });
          }
        });
    };

    return {
      TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression): void {
        if (isSqlTaggedTemplate(node)) {
          reportRawSql(node);
        }
      },
      CallExpression(node: TSESTree.CallExpression): void {
        const method = calledMethodName(node);
        if (method === 'withSchema') {
          reportSchemaArgument(node);
        } else if (method !== undefined && TABLE_METHODS.has(method)) {
          reportTableReferences(node);
        }
      },
    };
  },
});

export = rule;
