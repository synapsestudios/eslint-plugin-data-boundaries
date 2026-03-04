import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';
import * as fs from 'fs';
import { buildTableToDomainMapping } from '../utils/drizzle-parser';
import { extractModuleFromPath } from '../utils/schema-parser';

interface RuleOptions {
  schemaDir: string;
  modulePath: string;
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
 * Check if an import is from a Drizzle schema barrel export
 * Looks for patterns like: import { users } from '@/db/schema'
 */
function isSchemaImport(node: TSESTree.ImportDeclaration): boolean {
  if (!node.source.value || typeof node.source.value !== 'string') {
    return false;
  }

  const source = node.source.value;

  // Check for various patterns:
  // - '@/db/schema'
  // - '../db/schema'
  // - './schema'
  // - etc.
  return source.includes('/db/schema') || source.includes('/schema') || source.endsWith('/schema');
}

/**
 * ESLint rule to prevent modules from accessing Drizzle tables
 * that belong to other domains
 */
const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/synapsestudios/eslint-plugin-data-boundaries#${name}`
);

const rule = createRule<[RuleOptions], 'crossDomainAccess' | 'tableNotFound' | 'configError'>({
  name: 'no-cross-domain-drizzle-access',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow modules from accessing Drizzle tables defined in other domain schema files',
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
          modulePath: {
            type: 'string',
            description: 'Path pattern to match module directories (e.g., "/modules/", "/src/")',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      crossDomainAccess:
        "Module '{{currentModule}}' cannot access '{{tableName}}' table (belongs to '{{tableDomain}}' domain). Consider using a shared service or moving the logic to the appropriate domain.",
      tableNotFound:
        "Table '{{tableName}}' not found in any schema file. Ensure the table exists and schema files are properly configured.",
      configError:
        "Could not determine schema directory. Please configure the 'schemaDir' option in your ESLint config.",
    },
  },
  defaultOptions: [
    {
      schemaDir: 'src/db/schema',
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

    // Build table-to-domain mapping
    let tableToDomain: Record<string, string> = {};
    try {
      let schemaDir: string;
      if (path.isAbsolute(options.schemaDir)) {
        // Use absolute path directly (for tests)
        schemaDir = options.schemaDir;
      } else {
        // Resolve relative to project root (for real usage)
        const projectRoot = findProjectRoot(filename);
        schemaDir = path.join(projectRoot, options.schemaDir);
      }
      tableToDomain = buildTableToDomainMapping(schemaDir);
    } catch {
      // Report configuration error only once per file
      let reportedConfigError = false;
      return {
        Program(node: TSESTree.Program): void {
          if (!reportedConfigError) {
            context.report({
              node,
              messageId: 'configError',
            });
            reportedConfigError = true;
          }
        },
      };
    }

    // Track imported tables and their locations
    const importedTables: Map<string, TSESTree.Node> = new Map();

    return {
      // Detect imports: import { users, posts } from '@/db/schema'
      ImportDeclaration(node: TSESTree.ImportDeclaration): void {
        // Check if this is a schema import
        if (!isSchemaImport(node)) {
          return;
        }

        // Extract imported table names
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            const tableName = specifier.imported.name;
            importedTables.set(tableName, specifier);

            // Check if this table belongs to a different domain
            const tableDomain = tableToDomain[tableName];

            if (!tableDomain) {
              // Table not found in any schema file
              context.report({
                node: specifier,
                messageId: 'tableNotFound',
                data: { tableName },
              });
              continue;
            }

            // Check if current module matches table domain
            // Special case: 'index' files are treated as the domain name itself
            const effectiveCurrentModule =
              currentModule === 'index' ? path.basename(path.dirname(filename)) : currentModule;

            if (effectiveCurrentModule !== tableDomain) {
              context.report({
                node: specifier,
                messageId: 'crossDomainAccess',
                data: {
                  currentModule: effectiveCurrentModule,
                  tableName,
                  tableDomain,
                },
              });
            }
          }
        }
      },
    };
  },
});

export = rule;
