import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { extractModuleFromPath } from '../utils/schema-parser';

interface RuleOptions {
  modulePath: string;
}

/**
 * Extract table names from SQL string using simple regex patterns
 */
function extractTableNames(sql: string): string[] {
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

  patterns.forEach(pattern => {
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
function isTableAccessViolation(
  tableName: string,
  currentModule: string
): { isViolation: boolean; schema?: string; table?: string; reason?: string } {
  // Check if table name includes schema (schema.table format)
  if (tableName.includes('.')) {
    const [schema, table] = tableName.split('.', 2);
    
    // If schema is explicitly specified and doesn't match module, it's a violation
    if (schema && schema !== currentModule) {
      return {
        isViolation: true,
        schema,
        table,
        reason: 'crossSchema'
      };
    }
  } else {
    // For unqualified table names, this is now a violation - require explicit schema
    return { 
      isViolation: true, 
      table: tableName,
      reason: 'unqualified'
    };
  }

  return { isViolation: false };
}

/**
 * Check if node is a slonik sql tagged template literal
 */
function isSlonikSqlCall(node: TSESTree.TaggedTemplateExpression): boolean {
  if (node.tag.type === 'Identifier' && node.tag.name === 'sql') {
    return true;
  }

  // Handle member expressions like db.sql or this.sql
  if (node.tag.type === 'MemberExpression' && 
      node.tag.property.type === 'Identifier' && 
      node.tag.property.name === 'sql') {
    return true;
  }

  return false;
}

/**
 * Extract SQL string from template literal
 */
function extractSqlFromTemplate(node: TSESTree.TaggedTemplateExpression): string {
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
    const filename = context.getFilename();

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
        if (!isSlonikSqlCall(node)) {
          return;
        }

        // Extract SQL from template literal
        const sqlString = extractSqlFromTemplate(node);
        
        // Extract table names from SQL
        const tableNames = extractTableNames(sqlString);

        // Check each table for schema boundary violations
        tableNames.forEach(tableName => {
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