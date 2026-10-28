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

/**
 * ESLint rule to prevent slonik SQL queries from accessing tables
 * outside the current module's schema
 */
const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/synapsestudios/eslint-plugin-data-boundaries#${name}`
);

const rule = createRule<[RuleOptions], 'crossSchemaAccess' | 'unqualifiedTable'>({
  name: 'no-cross-schema-slonik-access',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow slonik SQL queries from accessing tables in schemas outside the current module',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          modulePath: {
            type: 'string',
            description: 'Path pattern to match module directories (e.g., "/modules/", "/src/")',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      crossSchemaAccess:
        "Module '{{currentModule}}' cannot access table '{{table}}' in schema '{{schema}}'. SQL queries should only access tables within the module's own schema ('{{currentModule}}').",
      unqualifiedTable:
        "Module '{{currentModule}}' must use fully qualified table names. Use '{{currentModule}}.{{table}}' instead of '{{table}}'.",
    },
  },
  defaultOptions: [
    {
      modulePath: '/modules/',
    },
  ],
  create(context, [options]) {
    const filename = context.filename;

    // Only process TypeScript files in modules
    if (!filename.includes(options.modulePath) || !filename.match(/\.(ts|tsx)$/)) {
      return {};
    }

    // Extract current module from file path
    const currentModule = extractModuleFromPath(filename, options.modulePath);
    if (!currentModule) {
      return {};
    }

    return {
      // Detect slonik sql tagged template literals
      TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression): void {
        if (!isSqlTaggedTemplate(node)) {
          return;
        }

        // Extract SQL from template literal
        const sqlString = extractSqlFromTemplate(node);

        // Extract table names from SQL
        const tableNames = extractTableNames(sqlString);

        // Check each table for schema boundary violations
        tableNames.forEach((tableName) => {
          const violation = isTableAccessViolation(tableName, currentModule);

          if (violation.isViolation) {
            if (violation.reason === 'crossSchema' && violation.schema && violation.table) {
              context.report({
                node,
                messageId: 'crossSchemaAccess',
                data: {
                  currentModule,
                  schema: violation.schema,
                  table: violation.table,
                },
              });
            } else if (violation.reason === 'unqualified' && violation.table) {
              context.report({
                node,
                messageId: 'unqualifiedTable',
                data: {
                  currentModule,
                  table: violation.table,
                },
              });
            }
          }
        });
      },
    };
  },
});

export = rule;
