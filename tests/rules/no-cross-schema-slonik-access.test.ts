const { RuleTester } = require('eslint');
const rule = require('../../dist/rules/no-cross-schema-slonik-access');
const fs = require('fs');
const path = require('path');

// Use TypeScript parser for this rule since it analyzes TypeScript code
const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

describe('no-cross-schema-slonik-access', () => {
  ruleTester.run('no-cross-schema-slonik-access', rule, {
    valid: [
      {
        name: 'auth module explicitly accessing its own schema',
        filename: '/app/modules/auth/repository.ts',
        code: `
          import { sql } from 'slonik';
          
          class AuthRepository {
            async findUserById(id: string) {
              return await this.db.query(sql\`
                SELECT * FROM auth.users WHERE id = \${id}
              \`);
            }
            
            async updateUserSession(userId: string, sessionData: any) {
              return await this.db.query(sql\`
                UPDATE auth.sessions 
                SET data = \${sessionData}
                WHERE user_id = \${userId}
              \`);
            }
          }
        `,
      },
      {
        name: 'organization module accessing its own schema tables',
        filename: '/app/modules/organization/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class OrganizationService {
            async getOrganization(id: string) {
              return await this.pool.query(sql\`
                SELECT * FROM organization.organizations WHERE id = \${id}
              \`);
            }
            
            async getMembers(orgId: string) {
              return await this.pool.query(sql\`
                SELECT m.*, u.email 
                FROM organization.memberships m
                JOIN organization.users u ON m.user_id = u.id
                WHERE m.organization_id = \${orgId}
              \`);
            }
          }
        `,
      },
      {
        name: 'non-module file should be ignored',
        filename: '/app/utils/database.ts',
        code: `
          import { sql } from 'slonik';
          
          // This should be allowed since it's not in a module directory
          export async function crossSchemaQuery() {
            return await pool.query(sql\`
              SELECT * FROM auth.users u
              JOIN organization.memberships m ON u.id = m.user_id
            \`);
          }
        `,
      },
      {
        name: 'non-sql tagged template should be ignored',
        filename: '/app/modules/auth/service.ts',
        code: `
          class AuthService {
            generateQuery() {
              return \`SELECT * FROM organization.users\`;
            }
            
            logMessage() {
              console.log\`User from organization.users\`;
            }
          }
        `,
      },
    ],
    invalid: [
      {
        name: 'auth module using unqualified table names',
        filename: '/app/modules/auth/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class AuthService {
            async getUser(id: string) {
              return await this.pool.query(sql\`
                SELECT * FROM users WHERE id = \${id}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'unqualifiedTable',
            data: {
              currentModule: 'auth',
              table: 'users',
            },
          },
        ],
      },
      {
        name: 'organization module using unqualified table names in JOIN',
        filename: '/app/modules/organization/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class OrganizationService {
            async getUserMemberships(userId: string) {
              return await this.pool.query(sql\`
                SELECT m.*, o.name 
                FROM memberships m
                JOIN organizations o ON m.organization_id = o.id
                WHERE m.user_id = \${userId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'unqualifiedTable',
            data: {
              currentModule: 'organization',
              table: 'memberships',
            },
          },
          {
            messageId: 'unqualifiedTable',
            data: {
              currentModule: 'organization',
              table: 'organizations',
            },
          },
        ],
      },
      {
        name: 'auth module accessing organization schema',
        filename: '/app/modules/auth/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class AuthService {
            async getUserOrganizations(userId: string) {
              return await this.pool.query(sql\`
                SELECT * FROM organization.memberships WHERE user_id = \${userId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'memberships',
            },
          },
        ],
      },
      {
        name: 'organization module accessing auth schema',
        filename: '/app/modules/organization/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class OrganizationService {
            async validateUser(userId: string) {
              return await this.db.query(sql\`
                SELECT * FROM auth.users WHERE id = \${userId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'organization',
              schema: 'auth',
              table: 'users',
            },
          },
        ],
      },
      {
        name: 'multiple cross-schema accesses in single query',
        filename: '/app/modules/billing/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class BillingService {
            async generateReport(orgId: string) {
              return await this.pool.query(sql\`
                SELECT 
                  u.email,
                  o.name as org_name,
                  COUNT(*) as transaction_count
                FROM auth.users u
                JOIN organization.memberships m ON u.id = m.user_id
                JOIN organization.organizations o ON m.organization_id = o.id
                WHERE o.id = \${orgId}
                GROUP BY u.id, o.id
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'billing',
              schema: 'auth',
              table: 'users',
            },
          },
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'billing',
              schema: 'organization',
              table: 'memberships',
            },
          },
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'billing',
              schema: 'organization',
              table: 'organizations',
            },
          },
        ],
      },
      {
        name: 'INSERT with cross-schema access',
        filename: '/app/modules/auth/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class AuthService {
            async createMembership(userId: string, orgId: string) {
              return await this.pool.query(sql\`
                INSERT INTO organization.memberships (user_id, organization_id)
                VALUES (\${userId}, \${orgId})
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'memberships',
            },
          },
        ],
      },
      {
        name: 'UPDATE with cross-schema access',
        filename: '/app/modules/auth/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class AuthService {
            async updateOrganization(orgId: string, name: string) {
              return await this.pool.query(sql\`
                UPDATE organization.organizations 
                SET name = \${name} 
                WHERE id = \${orgId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'organizations',
            },
          },
        ],
      },
      {
        name: 'DELETE with cross-schema access',
        filename: '/app/modules/organization/service.ts',
        code: `
          import { sql } from 'slonik';
          
          class OrganizationService {
            async deleteUser(userId: string) {
              return await this.pool.query(sql\`
                DELETE FROM auth.users WHERE id = \${userId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'organization',
              schema: 'auth',
              table: 'users',
            },
          },
        ],
      },
      {
        name: 'member expression sql call with cross-schema access',
        filename: '/app/modules/auth/service.ts',
        code: `
          class AuthService {
            constructor(private db: any) {}
            
            async getOrgData(orgId: string) {
              return await this.db.query(this.db.sql\`
                SELECT * FROM organization.organizations WHERE id = \${orgId}
              \`);
            }
          }
        `,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'organizations',
            },
          },
        ],
      },
    ],
  });
});

// Integration test with real slonik import
describe('integration test with real slonik import', () => {
  const slonikExamplePath = path.join(__dirname, '../fixtures/slonik-example.ts');
  const slonikExampleCode = fs.readFileSync(slonikExamplePath, 'utf8');

  const integrationRuleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  });

  integrationRuleTester.run('no-cross-schema-slonik-access integration', rule, {
    valid: [],
    invalid: [
      {
        name: 'real slonik file with multiple violations',
        filename: '/app/modules/auth/service.ts',
        code: slonikExampleCode,
        errors: [
          {
            messageId: 'unqualifiedTable',
            data: {
              currentModule: 'auth',
              table: 'users',
            },
          },
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'memberships',
            },
          },
          {
            messageId: 'unqualifiedTable',
            data: {
              currentModule: 'auth',
              table: 'users',
            },
          },
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'memberships',
            },
          },
          {
            messageId: 'crossSchemaAccess',
            data: {
              currentModule: 'auth',
              schema: 'organization',
              table: 'organizations',
            },
          },
        ],
      },
    ],
  });
});
