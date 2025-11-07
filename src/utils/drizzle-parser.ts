import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as parser from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

export interface TableToDomainMapping {
  [tableName: string]: string;
}

/**
 * Extract table definitions from Drizzle schema file AST
 * Looks for patterns like: export const users = pgTable('users', {...})
 */
export function extractTablesFromAst(ast: TSESTree.Program): string[] {
  const tables: string[] = [];

  function visit(node: any): void {
    if (!node) return;

    // Look for: export const tableName = pgTable/mysqlTable/sqliteTable(...)
    if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ) {
      const declarations = node.declaration.declarations;
      for (const decl of declarations) {
        if (
          decl.type === AST_NODE_TYPES.VariableDeclarator &&
          decl.id.type === AST_NODE_TYPES.Identifier &&
          decl.init?.type === AST_NODE_TYPES.CallExpression
        ) {
          const callee = decl.init.callee;
          // Check if calling pgTable, mysqlTable, or sqliteTable
          if (
            callee.type === AST_NODE_TYPES.Identifier &&
            (callee.name === 'pgTable' ||
              callee.name === 'mysqlTable' ||
              callee.name === 'sqliteTable')
          ) {
            // Add the exported constant name (the table reference)
            tables.push(decl.id.name);
          }
        }
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
  return tables;
}

/**
 * Extract table references from relations() calls
 * Looks for patterns like: relations(users, ...) or relations(posts, ...)
 */
function extractTableReferencesFromRelations(ast: TSESTree.Program): string[] {
  const references: string[] = [];

  function visit(node: any): void {
    if (!node) return;

    // Look for: relations(tableName, ({ one, many }) => ({...}))
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = node.callee;
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'relations') {
        // First argument should be the table reference
        const firstArg = node.arguments[0];
        if (firstArg?.type === AST_NODE_TYPES.Identifier) {
          references.push(firstArg.name);
        }
      }

      // Also look for one() and many() calls inside relations
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        (callee.name === 'one' || callee.name === 'many')
      ) {
        // First argument should be the referenced table
        const firstArg = node.arguments[0];
        if (firstArg?.type === AST_NODE_TYPES.Identifier) {
          references.push(firstArg.name);
        }
      }
    }

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
          body.object.type === AST_NODE_TYPES.Identifier
        ) {
          references.push(body.object.name);
        }
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
 * Parse all Drizzle schema files in a directory and build table-to-domain mapping
 */
export function buildTableToDomainMapping(schemaDir: string): TableToDomainMapping {
  const tableToDomain: TableToDomainMapping = {};

  try {
    // Find all .ts files in the schema directory
    const schemaFiles = glob.sync(path.join(schemaDir, '**/*.ts'));

    for (const filePath of schemaFiles) {
      const content = fs.readFileSync(filePath, 'utf8');

      // Parse TypeScript file
      const ast = parser.parse(content, {
        loc: true,
        range: true,
        jsx: false,
      });

      // Extract domain name from filename (e.g., auth.schema.ts -> auth)
      const fileName = path.basename(filePath);
      const match = fileName.match(/^(.+?)(?:\.schema)?\.ts$/);
      const domainName = match ? match[1] : path.basename(filePath, '.ts');

      // Extract tables from this schema file
      const tables = extractTablesFromAst(ast);
      for (const table of tables) {
        tableToDomain[table] = domainName;
      }
    }
  } catch (error) {
    // If we can't parse schemas, return empty mapping
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not parse Drizzle schema files in ${schemaDir}:`, errorMessage);
  }

  return tableToDomain;
}

/**
 * Check if a table reference in a schema file references a table from another file
 */
export function checkCrossSchemaTableReference(
  filePath: string,
  schemaDir: string
): { isValid: boolean; violations: Array<{ table: string; line: number; column: number }> } {
  const violations: Array<{ table: string; line: number; column: number }> = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(content, {
      loc: true,
      range: true,
      jsx: false,
    });

    // Get tables defined in this file
    const localTables = new Set(extractTablesFromAst(ast));

    // Get all table references (from relations, foreign keys, etc.)
    const referencedTables = extractTableReferencesFromRelations(ast);

    // Build mapping of all tables in schema directory
    const allTables = buildTableToDomainMapping(schemaDir);

    // Check each reference
    for (const refTable of referencedTables) {
      // Skip if it's defined locally
      if (localTables.has(refTable)) {
        continue;
      }

      // Check if it exists in another schema file
      if (allTables[refTable]) {
        // Find the location of this reference
        const location = findTableReferenceLocation(ast, refTable);
        violations.push({
          table: refTable,
          line: location.line,
          column: location.column,
        });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not check cross-schema references in ${filePath}:`, errorMessage);
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Find the location of a table reference in the AST
 */
function findTableReferenceLocation(
  ast: TSESTree.Program,
  tableName: string
): { line: number; column: number } {
  let location = { line: 1, column: 0 };

  function visit(node: any): boolean {
    if (!node) return false;

    // Look for identifier matching the table name
    if (node.type === AST_NODE_TYPES.Identifier && node.name === tableName && node.loc) {
      location = { line: node.loc.start.line, column: node.loc.start.column };
      return true; // Found it
    }

    // Recursively visit child nodes
    for (const key in node) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (visit(item)) return true;
        }
      } else if (typeof child === 'object') {
        if (visit(child)) return true;
      }
    }

    return false;
  }

  visit(ast);
  return location;
}
