import { Rule } from 'eslint';
import { Schema } from '@mrleebo/prisma-ast';

interface PrismaParserServices {
  getPrismaAst(): Schema;
}

/**
 * Helper function to find the line number of a field in the schema content
 * This is a simplified implementation that finds the first occurrence
 */
function getLineNumber(content: string, fieldName: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(fieldName)) {
      return i + 1; // ESLint uses 1-based line numbers
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

          // Extract all models defined in this file
          const definedModels = new Set<string>();

          ast.list.forEach((item) => {
            if (item.type === 'model' && item.name) {
              definedModels.add(item.name);
            }
          });

          // Check each model for cross-file references
          ast.list.forEach((item) => {
            if (item.type === 'model' && item.properties) {
              item.properties.forEach((property: any) => {
                if (property && property.fieldType && property.name) {
                  // Check if this field references another model
                  const referencedModelName = property.fieldType;

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
                  if (primitiveTypes.includes(referencedModelName)) {
                    return;
                  }

                  // Skip array types (remove [] suffix)
                  const cleanModelName = referencedModelName.replace(/\[\]$/, '');

                  // Check if the referenced model is defined in this file
                  if (!definedModels.has(cleanModelName)) {
                    // This is a cross-file model reference - report it
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
                        model: cleanModelName,
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
