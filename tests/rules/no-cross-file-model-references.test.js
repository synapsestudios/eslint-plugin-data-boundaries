const { RuleTester } = require('eslint');
const rule = require('../../lib/rules/no-cross-file-model-references');
const parser = require('../../lib/parsers/prisma-parser');

const ruleTester = new RuleTester({
  parser: require.resolve('../../lib/parsers/prisma-parser')
});

describe('no-cross-file-model-references', () => {
  ruleTester.run('no-cross-file-model-references', rule, {
    valid: [
      {
        name: 'models referencing other models in same file',
        filename: 'auth.prisma',
        code: `
          model User {
            id String @id
            sessions Session[]
          }
          
          model Session {
            id String @id
            userId String
            user User @relation(fields: [userId], references: [id])
          }
        `
      },
      {
        name: 'model with primitive types only',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            name String
            age Int
            isActive Boolean
            createdAt DateTime
            metadata Json
          }
        `
      },
      {
        name: 'model with array types',
        filename: 'organization.prisma',
        code: `
          model Organization {
            id String @id
            tags String[]
            members Member[]
          }
          
          model Member {
            id String @id
            organizationId String
            organization Organization @relation(fields: [organizationId], references: [id])
          }
        `
      },
      {
        name: 'non-prisma file should be ignored',
        filename: 'config.js',
        code: `
          const config = {
            database: 'postgresql://...'
          };
        `
      }
    ],

    invalid: [
      {
        name: 'model referencing undefined model',
        filename: 'auth.prisma',
        code: `
          model User {
            id String @id
            organizationId String
            organization Organization @relation(fields: [organizationId], references: [id])
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'organization',
              model: 'Organization'
            }
          }
        ]
      },
      {
        name: 'multiple cross-file references',
        filename: 'membership.prisma',
        code: `
          model Membership {
            id String @id
            userId String
            organizationId String
            user User @relation(fields: [userId], references: [id])
            organization Organization @relation(fields: [organizationId], references: [id])
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'user',
              model: 'User'
            }
          },
          {
            messageId: 'crossFileReference',
            data: {
              field: 'organization',
              model: 'Organization'
            }
          }
        ]
      },
      {
        name: 'array type cross-file reference',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            posts Post[]
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'posts',
              model: 'Post'
            }
          }
        ]
      }
    ]
  });
});