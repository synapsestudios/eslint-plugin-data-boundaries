import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';
import * as fs from 'fs';
import * as parser from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { extractTablesFromAst } from '../utils/drizzle-parser';

interface RuleOptions {
  schemaDir: string;
}

/**
 * Find project root by looking for package.json
 */
function findProjectRoot(filePath: string): string {
  let dir = path.dirname(filePath);

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  throw new Error('Could not find project root');
}

/**
 * Extract table references from the AST
 * Looks for patterns like:
 * - .references(() => table_name.id)
 * - relations(table_name, ...)
 * - one(table_name, ...)
 * - many(table_name, ...)
 */
function extractTableReferences(
  ast: TSESTree.Program
): Array<{ name: string; loc: TSESTree.SourceLocation }> {
  const references: Array<{ name: string; loc: TSESTree.SourceLocation }> = [];

  function visit(node: any): void {
    if (!node) return;

    // Look for .references() in column definitions
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === 'references'
    ) {
      // The argument is usually an arrow function: () => users.id
      const arg = node.arguments[0];
      if (arg?.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        const body = arg.body;
        // Look for users.id pattern
        if (
          body.type === AST_NODE_TYPES.MemberExpression &&
          body.object.type === AST_NODE_TYPES.Identifier &&
          body.object.loc
        ) {
          references.push({
            name: body.object.name,
            loc: body.object.loc,
          });
        }
      }
    }

    // Look for relations() calls
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'relations'
    ) {
      // First argument should be the table reference
      const firstArg = node.arguments[0];
      if (firstArg?.type === AST_NODE_TYPES.Identifier && firstArg.loc) {
        references.push({
          name: firstArg.name,
          loc: firstArg.loc,
        });
      }
    }

    // Look for one() and many() calls inside relations
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      (node.callee.name === 'one' || node.callee.name === 'many')
    ) {
      // First argument should be the referenced table
      const firstArg = node.arguments[0];
      if (firstArg?.type === AST_NODE_TYPES.Identifier && firstArg.loc) {
        references.push({
          name: firstArg.name,
          loc: firstArg.loc,
        });
      }
    }

    // Recursively visit child nodes
    for (const key in node) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (typeof child === 'object') {
        visit(child);
      }
    }
  }

  visit(ast);
  return references;
}

/**
 * Build a mapping of all tables to their schema files
 */
function buildTableToFileMapping(schemaDir: string): Map<string, string> {
  const tableToFile = new Map<string, string>();

  try {
    const files = fs.readdirSync(schemaDir);
    const schemaFiles = files.filter((f) => f.endsWith('.schema.ts') || f.endsWith('.ts'));

    for (const file of schemaFiles) {
      const filePath = path.join(schemaDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Parse TypeScript file
      const ast = parser.parse(content, {
        loc: true,
        range: true,
        jsx: false,
      });

      // Extract tables from this schema file
      const tables = extractTablesFromAst(ast);
      for (const table of tables) {
        tableToFile.set(table, file);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not build table-to-file mapping in ${schemaDir}:`, errorMessage);
  }

  return tableToFile;
}

/**
 * ESLint rule to prevent Drizzle table definitions in one schema file
 * from referencing tables in other schema files
 */
const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/synapsestudios/eslint-plugin-data-boundaries#${name}`
);

const rule = createRule<[RuleOptions], 'crossSchemaReference' | 'configError'>({
  name: 'no-cross-schema-drizzle-references',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Drizzle table definitions from referencing tables defined in other schema files',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          schemaDir: {
            type: 'string',
            description: 'Directory containing Drizzle schema files (relative to project root)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      crossSchemaReference:
        "Table '{{currentFile}}' references '{{tableName}}' which is defined in '{{referencedFile}}'. Cross-schema table references are not allowed. Consider moving related tables to the same schema file or restructuring your domain boundaries.",
      configError:
        "Could not determine schema directory. Please configure the 'schemaDir' option in your ESLint config.",
    },
  },
  defaultOptions: [
    {
      schemaDir: 'src/db/schema',
    },
  ],
  create(context, [options]) {
    const filename = context.getFilename();

    // Only process .schema.ts or .ts files in the schema directory
    if (!filename.includes('.schema.ts') && !filename.endsWith('.ts')) {
      return {};
    }

    return {
      Program(node: TSESTree.Program): void {
        try {
          // Determine schema directory
          let schemaDir: string;
          if (path.isAbsolute(options.schemaDir)) {
            schemaDir = options.schemaDir;
          } else {
            const projectRoot = findProjectRoot(filename);
            schemaDir = path.join(projectRoot, options.schemaDir);
          }

          // Check if this file is actually in the schema directory
          const normalizedFilename = path.normalize(filename);
          const normalizedSchemaDir = path.normalize(schemaDir);
          if (!normalizedFilename.startsWith(normalizedSchemaDir)) {
            return;
          }

          // Build mapping of all tables to their files
          const tableToFile = buildTableToFileMapping(schemaDir);

          // Get tables defined in this file
          const localTables = new Set(extractTablesFromAst(node));

          // Get all table references in this file
          const references = extractTableReferences(node);

          // Check each reference
          for (const ref of references) {
            // Skip if it's defined locally
            if (localTables.has(ref.name)) {
              continue;
            }

            // Check if it exists in another schema file
            const referencedFile = tableToFile.get(ref.name);
            if (referencedFile) {
              const currentFile = path.basename(filename);
              context.report({
                node,
                loc: ref.loc,
                messageId: 'crossSchemaReference',
                data: {
                  currentFile,
                  tableName: ref.name,
                  referencedFile,
                },
              });
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Could not find project root')) {
            context.report({
              node,
              messageId: 'configError',
            });
          }
        }
      },
    };
  },
});

export = rule;
