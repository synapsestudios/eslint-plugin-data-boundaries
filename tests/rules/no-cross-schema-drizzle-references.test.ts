const { RuleTester } = require('eslint');
const rule = require('../../dist/rules/no-cross-schema-drizzle-references');
const path = require('path');

// Use TypeScript parser for this rule since it analyzes TypeScript schema files
const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

const fixturesDir = path.join(__dirname, '../fixtures/drizzle-schema');

describe('no-cross-schema-drizzle-references', () => {
  ruleTester.run('no-cross-schema-drizzle-references', rule, {
    valid: [
      {
        name: 'table referencing another table in the same schema file',
        filename: path.join(fixturesDir, 'auth.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text } from 'drizzle-orm/pg-core';

          export const users = pgTable('users', {
            id: text('id').primaryKey(),
            name: text('name').notNull(),
          });

          export const sessions = pgTable('sessions', {
            id: text('id').primaryKey(),
            userId: text('user_id')
              .notNull()
              .references(() => users.id, { onDelete: 'cascade' }),
          });
        `,
      },
      {
        name: 'table with no foreign key references',
        filename: path.join(fixturesDir, 'organization.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

          export const organization = pgTable('organization', {
            id: uuid('id').primaryKey().defaultRandom(),
            name: text('name').notNull(),
            slug: text('slug').notNull().unique(),
          });
        `,
      },
      {
        name: 'multiple tables in same file with internal references',
        filename: path.join(fixturesDir, 'execution.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text, integer } from 'drizzle-orm/pg-core';

          export const execution = pgTable('execution', {
            id: text('id').primaryKey(),
            status: text('status').notNull(),
          });

          export const message = pgTable('message', {
            id: text('id').primaryKey(),
            executionId: text('execution_id')
              .notNull()
              .references(() => execution.id, { onDelete: 'cascade' }),
          });

          export const llmCall = pgTable('llm_call', {
            id: text('id').primaryKey(),
            executionId: text('execution_id')
              .notNull()
              .references(() => execution.id, { onDelete: 'cascade' }),
          });
        `,
      },
      {
        name: 'file outside schema directory should be ignored',
        filename: '/app/src/utils/helper.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { organization } from '../db/schema';

          export function getOrgId() {
            return organization.id;
          }
        `,
      },
    ],

    invalid: [
      {
        name: 'table referencing table from another schema file',
        filename: path.join(fixturesDir, 'execution.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text } from 'drizzle-orm/pg-core';
          import { identity_user } from './auth.schema';

          export const execution = pgTable('execution', {
            id: text('id').primaryKey(),
            userId: text('user_id')
              .notNull()
              .references(() => identity_user.id, { onDelete: 'cascade' }),
          });
        `,
        errors: [
          {
            messageId: 'crossSchemaReference',
            data: {
              currentFile: 'execution.schema.ts',
              tableName: 'identity_user',
              referencedFile: 'auth.schema.ts',
            },
          },
        ],
      },
      {
        name: 'relations referencing table from another schema file',
        filename: path.join(fixturesDir, 'organization.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text } from 'drizzle-orm/pg-core';
          import { relations } from 'drizzle-orm';
          import { identity_user } from './auth.schema';

          export const organization = pgTable('organization', {
            id: text('id').primaryKey(),
            name: text('name').notNull(),
          });

          export const organizationRelations = relations(organization, ({ many }) => ({
            users: many(identity_user),
          }));
        `,
        errors: [
          {
            messageId: 'crossSchemaReference',
            data: {
              currentFile: 'organization.schema.ts',
              tableName: 'identity_user',
              referencedFile: 'auth.schema.ts',
            },
          },
        ],
      },
      {
        name: 'multiple cross-schema references',
        filename: path.join(fixturesDir, 'task.schema.ts'),
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
          import { identity_user } from './auth.schema';
          import { organization } from './organization.schema';

          export const task = pgTable('task', {
            id: text('id').primaryKey(),
            createdById: text('created_by_id')
              .notNull()
              .references(() => identity_user.id),
            organizationId: uuid('organization_id')
              .notNull()
              .references(() => organization.id),
          });
        `,
        errors: [
          {
            messageId: 'crossSchemaReference',
            data: {
              currentFile: 'task.schema.ts',
              tableName: 'identity_user',
              referencedFile: 'auth.schema.ts',
            },
          },
          {
            messageId: 'crossSchemaReference',
            data: {
              currentFile: 'task.schema.ts',
              tableName: 'organization',
              referencedFile: 'organization.schema.ts',
            },
          },
        ],
      },
    ],
  });
});
