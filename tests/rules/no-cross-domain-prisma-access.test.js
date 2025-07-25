const { RuleTester } = require('eslint');
const rule = require('../../lib/rules/no-cross-domain-prisma-access');
const path = require('path');

// Use TypeScript parser for this rule since it analyzes TypeScript code
const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  }
});

const fixturesDir = path.join(__dirname, '../fixtures/schema');

describe('no-cross-domain-prisma-access', () => {
  ruleTester.run('no-cross-domain-prisma-access', rule, {
    valid: [
      {
        name: 'auth module accessing auth domain models',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          class AuthService {
            async getUser(id: string) {
              return this.prisma.user.findUnique({ where: { id } });
            }
            
            async getSessions(userId: string) {
              return this.prisma.session.findMany({ where: { userId } });
            }
          }
        `
      },
      {
        name: 'organization module accessing organization domain models',
        filename: '/app/modules/organization/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          class OrganizationService {
            async getOrganization(id: string) {
              return this.prisma.organization.findUnique({ where: { id } });
            }
            
            async getMemberships(orgId: string) {
              return this.prisma.membership.findMany({ where: { organizationId: orgId } });
            }
          }
        `
      },
      {
        name: 'accessing shared models from any domain',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          class AuthService {
            async logAction(action: string) {
              return this.prisma.auditLog.create({ data: { action } });
            }
            
            async getSetting(key: string) {
              return this.prisma.setting.findUnique({ where: { key } });
            }
          }
        `
      },
      {
        name: 'non-module file should be ignored',
        filename: '/lib/utils/helper.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          export function helper() {
            return prisma.user.findMany();
          }
        `
      },
      {
        name: 'non-prisma access should be ignored',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          class AuthService {
            async getData() {
              return this.api.user.getData();
              return service.findMany();
              return obj.create();
            }
          }
        `
      },
      {
        name: 'accessing prisma methods should be ignored',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          class AuthService {
            async disconnect() {
              await this.prisma.disconnect();
              await this.prisma.$disconnect();
            }
          }
        `
      }
    ],

    invalid: [
      {
        name: 'auth module accessing organization domain models',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          class AuthService {
            async getOrganizations() {
              return this.prisma.organization.findMany();
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'auth',
              modelName: 'Organization',
              modelDomain: 'organization'
            }
          }
        ]
      },
      {
        name: 'organization module accessing auth domain models',
        filename: '/app/modules/organization/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          class OrganizationService {
            async getUsers() {
              return this.prisma.user.findMany();
            }
            
            async createSession(userId: string) {
              return this.prisma.session.create({ data: { userId } });
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'organization',
              modelName: 'User',
              modelDomain: 'auth'
            }
          },
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'organization',
              modelName: 'Session',
              modelDomain: 'auth'
            }
          }
        ]
      },
      {
        name: 'accessing non-existent model',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir }],
        code: `
          class AuthService {
            async getProjects() {
              return this.prisma.project.findMany();
            }
          }
        `,
        errors: [
          {
            messageId: 'modelNotFound',
            data: {
              modelName: 'Project'
            }
          }
        ]
      },
      {
        name: 'direct prisma access violations',
        filename: '/app/modules/auth/controller.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: true }],
        code: `
          export async function getOrganizations() {
            return prisma.organization.findMany();
          }
          
          export async function getMemberships() {
            return prisma.membership.findMany();
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'auth',
              modelName: 'Organization',
              modelDomain: 'organization'
            }
          },
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'auth',
              modelName: 'Membership',
              modelDomain: 'organization'
            }
          }
        ]
      },
      {
        name: 'shared models blocked when allowSharedModels is false',
        filename: '/app/modules/auth/service.ts',
        options: [{ schemaDir: fixturesDir, allowSharedModels: false }],
        code: `
          class AuthService {
            async logAction() {
              return this.prisma.auditLog.create({ data: { action: 'login' } });
            }
          }
        `,
        errors: [
          {
            messageId: 'crossDomainAccess',
            data: {
              currentModule: 'auth',
              modelName: 'AuditLog',
              modelDomain: 'shared'
            }
          }
        ]
      }
    ]
  });
});