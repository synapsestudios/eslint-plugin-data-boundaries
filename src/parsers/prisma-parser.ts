import { getSchema, Schema } from '@mrleebo/prisma-ast';
import { AST } from 'eslint';

interface PrismaEslintAST extends AST.Program {
  prismaAst: Schema;
}

interface ParseResult {
  ast: PrismaEslintAST | AST.Program;
  services: {
    getPrismaAst?: () => Schema;
  };
  scopeManager: null;
  visitorKeys: Record<string, never>;
}

/**
 * Custom ESLint parser for Prisma schema files
 * Converts Prisma AST to ESLint-compatible AST
 */
export function parseForESLint(code: string, _options: Record<string, unknown> = {}): ParseResult {
  try {
    // Parse Prisma schema
    const prismaAst = getSchema(code);

    // Convert to ESLint AST format
    const eslintAst: PrismaEslintAST = {
      type: 'Program',
      body: [],
      sourceType: 'module',
      range: [0, code.length],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: code.split('\n').length, column: 0 },
      },
      tokens: [],
      comments: [],
      // Store the Prisma AST for rule access
      prismaAst: prismaAst,
    };

    return {
      ast: eslintAst,
      services: {
        getPrismaAst: () => prismaAst,
      },
      scopeManager: null,
      visitorKeys: {},
    };
  } catch {
    // Return a minimal AST on parse errors
    return {
      ast: {
        type: 'Program',
        body: [],
        sourceType: 'module',
        range: [0, code.length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 0 },
        },
        tokens: [],
        comments: [],
      },
      services: {},
      scopeManager: null,
      visitorKeys: {},
    };
  }
}
