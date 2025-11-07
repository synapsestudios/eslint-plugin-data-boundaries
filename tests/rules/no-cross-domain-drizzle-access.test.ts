const { RuleTester } = require('eslint');
const rule = require('../../dist/rules/no-cross-domain-drizzle-access');
const path = require('path');

// Use TypeScript parser for this rule since it analyzes TypeScript code
const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

const fixturesDir = path.join(__dirname, '../fixtures/drizzle-schema');

describe('no-cross-domain-drizzle-access', () => {
  ruleTester.run('no-cross-domain-drizzle-access', rule, {
    valid: [
      {
        name: 'auth module accessing auth domain tables',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { identity_user, identity_session, identity_account } from '@/db/schema';

          class AuthService {
            async getUser(id: string) {
              return db.select().from(identity_user).where(eq(identity_user.id, id));
            }

            async getSessions(userId: string) {
              return db.select().from(identity_session).where(eq(identity_session.userId, userId));
            }
          }
        `,
      },
      {
        name: 'organization module accessing organization domain tables',
        filename: '/app/modules/organization/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { organization } from '@/db/schema';

          class OrganizationService {
            async getOrganization(id: string) {
              return db.select().from(organization).where(eq(organization.id, id));
            }
          }
        `,
      },
      {
        name: 'execution module accessing execution domain tables',
        filename: '/app/modules/execution/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { execution, message, llmCall } from '@/db/schema';

          class ExecutionService {
            async getExecution(id: string) {
              return db.select().from(execution).where(eq(execution.id, id));
            }

            async getMessages(executionId: string) {
              return db.select().from(message).where(eq(message.executionId, executionId));
            }
          }
        `,
      },
      {
        name: 'non-module file should be ignored',
        filename: '/lib/utils/helper.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { identity_user } from '@/db/schema';

          export function helper() {
            return identity_user;
          }
        `,
      },
      {
        name: 'custom modulePath works - NestJS style with /src/',
        filename: '/app/src/auth/service.ts',
        options: [{ schemaDir: fixturesDir, modulePath: '/src/' }],
        code: `
          import { identity_user } from '@/db/schema';

          class AuthService {
            async getUser(id: string) {
              return db.select().from(identity_user).where(eq(identity_user.id, id));
            }
          }
        `,
      },
      {
        name: 'import from non-schema path should be ignored',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { identity_user } from './entities/user';
          import { organization } from '../organization/entities';

          class AuthService {
            async getData() {
              return { identity_user, organization };
            }
          }
        `,
      },
    ],

    invalid: [
      {
        name: 'auth module accessing organization domain tables',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { organization } from '@/db/schema';

          class AuthService {
            async getOrganization(id: string) {
              return db.select().from(organization).where(eq(organization.id, id));
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'auth',
              tableName: 'organization',
              tableDomain: 'organization',
            },
          },
        ],
      },
      {
        name: 'organization module accessing auth domain tables',
        filename: '/app/modules/organization/repository.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { identity_user, identity_session } from '@/db/schema';

          class OrganizationRepository {
            async getUsersByOrg(orgId: string) {
              return db.select().from(identity_user);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'organization',
              tableName: 'identity_user',
              tableDomain: 'auth',
            },
          },
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'organization',
              tableName: 'identity_session',
              tableDomain: 'auth',
            },
          },
        ],
      },
      {
        name: 'execution module accessing auth domain tables',
        filename: '/app/modules/execution/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { execution, identity_user } from '@/db/schema';

          class ExecutionService {
            async getExecutionWithUser(id: string) {
              return db.select()
                .from(execution)
                .leftJoin(identity_user, eq(execution.userId, identity_user.id));
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'execution',
              tableName: 'identity_user',
              tableDomain: 'auth',
            },
          },
        ],
      },
      {
        name: 'table not found in schema files',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { nonexistent_table } from '@/db/schema';

          class AuthService {
            async getData() {
              return db.select().from(nonexistent_table);
            }
          }
        `,
        errors: [
          {
            messageId: 'tableNotFound',
            data: {
              tableName: 'nonexistent_table',
            },
          },
        ],
      },
      {
        name: 'multiple cross-domain violations',
        filename: '/app/modules/task/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          import { identity_user, organization, execution } from '@/db/schema';

          class TaskService {
            async getData() {
              return { identity_user, organization, execution };
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'task',
              tableName: 'identity_user',
              tableDomain: 'auth',
            },
          },
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'task',
              tableName: 'organization',
              tableDomain: 'organization',
            },
          },
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'task',
              tableName: 'execution',
              tableDomain: 'execution',
            },
          },
        ],
      },
    ],
  });
});
