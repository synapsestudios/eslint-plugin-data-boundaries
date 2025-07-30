import { Rule } from 'eslint';
import { Schema } from '@mrleebo/prisma-ast';

interface PrismaParserServices {
  getPrismaAst(): Schema;
}

/**
 * Helper function to find the line number of a field in the schema content
 * Looks for the field name followed by a type (space-separated tokens)
 */
function getLineNumber(content: string, fieldName: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Look for lines that start with the field name followed by whitespace and a type
    // This avoids matching field names that appear in comments or other contexts
    const fieldPattern = new RegExp(`^${fieldName}\\s+\\w+`);
    if (fieldPattern.test(line)) {
      return i + 1; // ESLint uses 1-based line numbers
    }
  }
  
  // Fallback: look for any line containing the field name
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(fieldName)) {
      return i + 1;
    }
  }
  
  return 1; // Default to line 1 if not found
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Prisma models from referencing models defined in other files',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      crossFileReference:
        "Model field '{{field}}' references '{{model}}' which is not defined in this file. Cross-file model references are not allowed.",
    },
  },

  create(context: Rule.RuleContext): Rule.RuleListener {
    // Only process .prisma files
    const filename = context.getFilename();
    if (!filename.endsWith('.prisma')) {
      return {};
    }

    return {
      Program(node: any): void {
        try {
          // Get Prisma AST from parser services
          const services = context.getSourceCode().parserServices as
            | PrismaParserServices
            | undefined;
          if (!services || !services.getPrismaAst) {
            // Parser doesn't support Prisma AST
            return;
          }

          const ast = services.getPrismaAst();

          // Extract all models and enums defined in this file
          const definedTypes = new Set<string>();

          ast.list.forEach((item) => {
            if ((item.type === 'model' || item.type === 'enum') && item.name) {
              definedTypes.add(item.name);
            }
          });

          // Check each model for cross-file references
          ast.list.forEach((item) => {
            if (item.type === 'model' && item.properties) {
              item.properties.forEach((property: any) => {
                if (property && property.type === 'field' && property.fieldType && property.name) {
                  // Extract the field type - handle both simple types and complex types
                  let referencedTypeName: string;
                  
                  // Helper function to recursively extract the base type name
                  function extractBaseType(fieldType: any): string {
                    if (typeof fieldType === 'string') {
                      return fieldType;
                    }
                    
                    if (fieldType && fieldType.type) {
                      switch (fieldType.type) {
                        case 'array':
                          return extractBaseType(fieldType.fieldType);
                        case 'optional':
                          return extractBaseType(fieldType.fieldType);
                        default:
                          // For other types, try to get the name or fieldType
                          return fieldType.name || extractBaseType(fieldType.fieldType) || '';
                      }
                    }
                    
                    return '';
                  }
                  
                  referencedTypeName = extractBaseType(property.fieldType);
                  
                  if (!referencedTypeName) {
                    // Skip if we can't determine the type
                    return;
                  }

                  // Skip primitive types (String, Int, DateTime, etc.)
                  const primitiveTypes = [
                    'String',
                    'Int',
                    'Float',
                    'Boolean',
                    'DateTime',
                    'Json',
                    'Bytes',
                  ];
                  if (primitiveTypes.includes(referencedTypeName)) {
                    return;
                  }

                  // Check if the referenced type is defined in this file
                  if (!definedTypes.has(referencedTypeName)) {
                    // This is a cross-file reference - report it
                    const sourceCode = context.getSourceCode();
                    const schemaContent = sourceCode.getText();
                    const fieldLine = getLineNumber(schemaContent, property.name as string);

                    context.report({
                      node,
                      loc: {
                        line: fieldLine,
                        column: 0,
                      },
                      messageId: 'crossFileReference',
                      data: {
                        field: property.name as string,
                        model: referencedTypeName,
                      },
                    });
                  }
                }
              });
            }
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error parsing Prisma schema in ${filename}:`, errorMessage);
          // Don't report ESLint errors for parsing issues
        }
      },
    };
  },
};

export = rule;
