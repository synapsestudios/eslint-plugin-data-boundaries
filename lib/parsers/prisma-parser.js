const { getSchema } = require('@mrleebo/prisma-ast');

/**
 * Custom ESLint parser for Prisma schema files
 * Converts Prisma AST to ESLint-compatible AST
 */

module.exports = {
  parseForESLint(code, options = {}) {
    try {
      // Parse Prisma schema
      const prismaAst = getSchema(code);
      
      // Convert to ESLint AST format
      const eslintAst = {
        type: 'Program',
        body: [],
        sourceType: 'module',
        range: [0, code.length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: code.split('\n').length, column: 0 }
        },
        tokens: [],
        comments: [],
        // Store the Prisma AST for rule access
        prismaAst: prismaAst
      };
      
      return {
        ast: eslintAst,
        services: {
          getPrismaAst: () => prismaAst
        },
        scopeManager: null,
        visitorKeys: {}
      };
      
    } catch (error) {
      // Return a minimal AST on parse errors
      return {
        ast: {
          type: 'Program',
          body: [],
          sourceType: 'module',
          range: [0, code.length],
          loc: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: 0 }
          }
        },
        services: {},
        scopeManager: null,
        visitorKeys: {}
      };
    }
  }
};