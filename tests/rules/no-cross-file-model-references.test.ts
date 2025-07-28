const { RuleTester } = require('eslint');
const rule = require('../../dist/rules/no-cross-file-model-references');

const ruleTester = new RuleTester({
  parser: require.resolve('../../dist/parsers/prisma-parser'),
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
        `,
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
        `,
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
        `,
      },
      {
        name: 'non-prisma file should be ignored',
        filename: 'config.js',
        code: `
          const config = {
            database: 'postgresql://...'
          };
        `,
      },
      {
        name: 'models with similar names but no cross-file references',
        filename: 'payment.prisma',
        code: `
          model DraftListingPayment {
            id String @id
            draftListingId String
            paymentId String
            payment Payment @relation(fields: [paymentId], references: [id])
          }
          
          model Payment {
            id String @id
            amount Int
            draftListingPayments DraftListingPayment[]
          }
        `,
      },
      {
        name: 'models where one name starts with another but both are defined locally',
        filename: 'listing.prisma',
        code: `
          model Listing {
            id String @id
            listingDetails ListingDetail[]
          }
          
          model ListingDetail {
            id String @id
            listingId String
            listing Listing @relation(fields: [listingId], references: [id])
          }
        `,
      },
      {
        name: 'models with prefix names all defined in same file',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            userPreferences UserPreference[]
            userProfiles UserProfile[]
          }
          
          model UserPreference {
            id String @id
            userId String
            user User @relation(fields: [userId], references: [id])
          }
          
          model UserProfile {
            id String @id
            userId String
            user User @relation(fields: [userId], references: [id])
          }
        `,
      },
      {
        name: 'field name collision edge case - similar field names should not confuse line detection',
        filename: 'edge-case.prisma',
        code: `
          model TestModel {
            id String @id
            payment Payment @relation(fields: [paymentId], references: [id])
            paymentId String
            paymentDetails PaymentDetail[]
          }
          
          model Payment {
            id String @id
            testModel TestModel[]
          }
          
          model PaymentDetail {
            id String @id
            testModelId String
            testModel TestModel @relation(fields: [testModelId], references: [id])
          }
        `,
      },
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
              model: 'Organization',
            },
          },
        ],
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
              model: 'User',
            },
          },
          {
            messageId: 'crossFileReference',
            data: {
              field: 'organization',
              model: 'Organization',
            },
          },
        ],
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
              model: 'Post',
            },
          },
        ],
      },
      {
        name: 'model with prefix name referencing undefined model (edge case test)',
        filename: 'draft.prisma',
        code: `
          model DraftListingPayment {
            id String @id
            draftListingId String
            paymentId String
            draftListing DraftListing @relation(fields: [draftListingId], references: [id])
            payment Payment @relation(fields: [paymentId], references: [id])
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'draftListing',
              model: 'DraftListing',
            },
          },
          {
            messageId: 'crossFileReference',
            data: {
              field: 'payment',
              model: 'Payment',
            },
          },
        ],
      },
    ],
  });
});
