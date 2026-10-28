import { TSESTree } from '@typescript-eslint/utils';

export type TableAccessViolation =
  | { isViolation: false }
  | { isViolation: true; reason: 'crossSchema'; schema: string; table: string }
  | { isViolation: true; reason: 'unqualified'; table: string };

/**
 * Extract table names from SQL string using simple regex patterns
 */
export function extractTableNames(sql: string): string[] {
  const tableNames: string[] = [];

  // Remove comments and normalize whitespace
  const cleanSql = sql
    .replace(/--.*$/gm, '') // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Patterns to match table references
  const patterns = [
    // FROM clause: FROM schema.table, FROM table
    /FROM\s+(?:(\w+)\.)?(\w+)/gi,
    // JOIN clause: JOIN schema.table, JOIN table
    /JOIN\s+(?:(\w+)\.)?(\w+)/gi,
    // INSERT INTO: INSERT INTO schema.table, INSERT INTO table
    /INSERT\s+INTO\s+(?:(\w+)\.)?(\w+)/gi,
    // UPDATE: UPDATE schema.table, UPDATE table
    /UPDATE\s+(?:(\w+)\.)?(\w+)/gi,
    // DELETE FROM: DELETE FROM schema.table, DELETE FROM table
    /DELETE\s+FROM\s+(?:(\w+)\.)?(\w+)/gi,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(cleanSql)) !== null) {
      const schema = match[1];
      const table = match[2];

      if (table && table.toLowerCase() !== 'select') {
        // If schema is specified, use schema.table format
        if (schema) {
          tableNames.push(`${schema}.${table}`);
        } else {
          // If no schema specified, just use table name
          tableNames.push(table);
        }
      }
    }
  });

  return [...new Set(tableNames)]; // Remove duplicates
}

/**
 * Check if a table reference violates schema boundaries
 */
export function isTableAccessViolation(
  tableName: string,
  currentModule: string
): TableAccessViolation {
  // Check if table name includes schema (schema.table format)
  if (tableName.includes('.')) {
    const [schema, table] = tableName.split('.', 2);

    // If schema is explicitly specified and doesn't match module, it's a violation
    if (schema && schema !== currentModule) {
      return { isViolation: true, reason: 'crossSchema', schema, table };
    }
  } else {
    // For unqualified table names, this is now a violation - require explicit schema
    return { isViolation: true, reason: 'unqualified', table: tableName };
  }

  return { isViolation: false };
}

/**
 * Check if node is a `sql` tagged template literal, as slonik and Kysely write them
 */
export function isSqlTaggedTemplate(node: TSESTree.TaggedTemplateExpression): boolean {
  if (node.tag.type === 'Identifier' && node.tag.name === 'sql') {
    return true;
  }

  // Handle member expressions like db.sql or this.sql
  if (
    node.tag.type === 'MemberExpression' &&
    node.tag.property.type === 'Identifier' &&
    node.tag.property.name === 'sql'
  ) {
    return true;
  }

  return false;
}

/**
 * Extract SQL string from template literal
 */
export function extractSqlFromTemplate(node: TSESTree.TaggedTemplateExpression): string {
  const quasi = node.quasi;

  // Combine all template parts into a single string
  let sql = '';

  quasi.quasis.forEach((element, index) => {
    sql += element.value.raw;

    // Add placeholder for expressions (${...})
    if (index < quasi.expressions.length) {
      sql += ' ? '; // Use placeholder for parameter
    }
  });

  return sql;
}
