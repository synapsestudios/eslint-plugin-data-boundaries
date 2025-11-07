import * as path from 'path';
import { buildTableToDomainMapping, extractTablesFromAst } from '../../src/utils/drizzle-parser';
import * as parser from '@typescript-eslint/typescript-estree';

describe('drizzle-parser', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/drizzle-schema');

  describe('buildTableToDomainMapping', () => {
    it('should map tables to their domain files', () => {
      const mapping = buildTableToDomainMapping(fixturesDir);

      expect(mapping).toEqual({
        identity_user: 'auth',
        identity_session: 'auth',
        identity_account: 'auth',
        organization: 'organization',
        execution: 'execution',
        message: 'execution',
        llmCall: 'execution',
      });
    });

    it('should handle non-existent directories gracefully', () => {
      const mapping = buildTableToDomainMapping('/non/existent/path');
      expect(mapping).toEqual({});
    });

    it('should extract domain name from .schema.ts files', () => {
      const mapping = buildTableToDomainMapping(fixturesDir);

      // Verify auth domain tables
      expect(mapping['identity_user']).toBe('auth');
      expect(mapping['identity_session']).toBe('auth');
    });
  });

  describe('extractTablesFromAst', () => {
    it('should extract table definitions using pgTable', () => {
      const code = `
        import { pgTable, text } from 'drizzle-orm/pg-core';

        export const users = pgTable('users', {
          id: text('id').primaryKey(),
          name: text('name').notNull(),
        });

        export const posts = pgTable('posts', {
          id: text('id').primaryKey(),
          title: text('title').notNull(),
        });
      `;

      const ast = parser.parse(code, {
        loc: true,
        range: true,
        jsx: false,
      });

      const tables = extractTablesFromAst(ast);
      expect(tables).toEqual(['users', 'posts']);
    });

    it('should extract table definitions using mysqlTable', () => {
      const code = `
        import { mysqlTable, int } from 'drizzle-orm/mysql-core';

        export const users = mysqlTable('users', {
          id: int('id').primaryKey(),
        });
      `;

      const ast = parser.parse(code, {
        loc: true,
        range: true,
        jsx: false,
      });

      const tables = extractTablesFromAst(ast);
      expect(tables).toEqual(['users']);
    });

    it('should extract table definitions using sqliteTable', () => {
      const code = `
        import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';

        export const users = sqliteTable('users', {
          id: integer('id').primaryKey(),
        });
      `;

      const ast = parser.parse(code, {
        loc: true,
        range: true,
        jsx: false,
      });

      const tables = extractTablesFromAst(ast);
      expect(tables).toEqual(['users']);
    });

    it('should handle files with no tables', () => {
      const code = `
        import { text } from 'drizzle-orm/pg-core';

        const helper = () => {};
      `;

      const ast = parser.parse(code, {
        loc: true,
        range: true,
        jsx: false,
      });

      const tables = extractTablesFromAst(ast);
      expect(tables).toEqual([]);
    });

    it('should ignore non-table variable declarations', () => {
      const code = `
        import { pgTable, text } from 'drizzle-orm/pg-core';

        export const users = pgTable('users', {
          id: text('id').primaryKey(),
        });

        export const config = { foo: 'bar' };
        const helper = () => {};
      `;

      const ast = parser.parse(code, {
        loc: true,
        range: true,
        jsx: false,
      });

      const tables = extractTablesFromAst(ast);
      expect(tables).toEqual(['users']);
    });
  });
});
