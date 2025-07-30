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
      {
        name: 'enum references should be valid when enum is defined in same file',
        filename: 'organization.prisma',
        code: `
          enum OrganizationRole {
            OWNER
            ADMIN
            MEMBER
            READONLY
          }
          
          model Organization {
            id String @id
            name String
            userOrganizations UserOrganization[]
          }
          
          model UserOrganization {
            id String @id
            role OrganizationRole @default(READONLY)
            organizationId String
            organization Organization @relation(fields: [organizationId], references: [id])
          }
        `,
      },
      {
        name: 'mixed enum and model references all defined in same file',
        filename: 'auth.prisma',
        code: `
          enum UserStatus {
            ACTIVE
            INACTIVE
            SUSPENDED
          }
          
          enum UserRole {
            USER
            ADMIN
          }
          
          model User {
            id String @id
            status UserStatus @default(ACTIVE)
            role UserRole @default(USER)
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
        name: "REGRESSION: user's schema without cross-file references should be valid",
        filename: 'organization.prisma',
        code: `
model Organization {
  id                String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  githubId          String             @unique @map("github_id")
  slug              String             @unique
  name              String
  displayName       String             @map("display_name")
  logoUrl           String?            @map("logo_url")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")
  userOrganizations UserOrganization[]

  @@map("organizations")
}

enum OrganizationRole {
  OWNER
  ADMIN
  MEMBER
  READONLY
}

model UserOrganization {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  organizationId String           @map("organization_id") @db.Uuid
  role           OrganizationRole @default(READONLY)
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@map("user_organizations")
}`,
      },
      {
        name: 'complex field type combinations - optional and array enums',
        filename: 'complex-types.prisma',
        code: `
          enum Permission {
            READ
            WRITE
            ADMIN
          }
          
          enum Status {
            ACTIVE
            INACTIVE
          }
          
          model User {
            id String @id
            primaryPermission Permission @default(READ)
            secondaryPermission Permission?
            allPermissions Permission[]
            optionalPermissions Permission[]?
            status Status @default(ACTIVE)
            statusHistory Status[]
          }
        `,
      },
      {
        name: 'similar type name prefixes should not cause confusion',
        filename: 'prefix-test.prisma',
        code: `
          model User {
            id String @id
            userProfile UserProfile @relation(fields: [userProfileId], references: [id])
            userProfileId String
            userPreferences UserPreference[]
            userOrganizations UserOrganization[]
          }
          
          model UserProfile {
            id String @id 
            userId String
            user User[]
          }
          
          model UserPreference {
            id String @id
            userId String
            user User @relation(fields: [userId], references: [id])
          }
          
          model UserOrganization {
            id String @id
            userId String  
            user User @relation(fields: [userId], references: [id])
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
      {
        name: 'enum reference to undefined enum should fail',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            status UserStatus @default(ACTIVE)
            role OrganizationRole @default(MEMBER)
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'status',
              model: 'UserStatus',
            },
          },
          {
            messageId: 'crossFileReference',
            data: {
              field: 'role',
              model: 'OrganizationRole',
            },
          },
        ],
      },
      {
        name: 'mixed valid and invalid references - should only flag the invalid ones',
        filename: 'membership.prisma',
        code: `
          enum MembershipType {
            BASIC
            PREMIUM
          }
          
          model Membership {
            id String @id
            type MembershipType @default(BASIC)
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
        name: "REGRESSION: should detect User cross-file reference from user's problematic schema",
        filename: 'organization.prisma',
        code: `
model Organization {
  id                String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userOrganizations UserOrganization[]
}

enum OrganizationRole {
  OWNER
  ADMIN
  MEMBER
  READONLY
}

model UserOrganization {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  role           OrganizationRole @default(READONLY)
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String
  userId         String
}`,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'user',
              model: 'User',
            },
          },
        ],
      },
      {
        name: 'REGRESSION: optional field types should be detected',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            optionalRole ExternalRole?
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'optionalRole',
              model: 'ExternalRole',
            },
          },
        ],
      },
      {
        name: 'REGRESSION: array types should be detected',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            roles ExternalRole[]
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'roles',
              model: 'ExternalRole',
            },
          },
        ],
      },
      {
        name: 'REGRESSION: should correctly parse UserOrganization[] as UserOrganization, not User',
        filename: 'user.prisma',
        code: `
          model User {
            id String @id
            userOrganizations UserOrganization[]
            userPreferences UserPreference[]
          }
        `,
        errors: [
          {
            messageId: 'crossFileReference',
            data: {
              field: 'userOrganizations',
              model: 'UserOrganization',
            },
          },
          {
            messageId: 'crossFileReference',
            data: {
              field: 'userPreferences',
              model: 'UserPreference',
            },
          },
        ],
      },
    ],
  });
});
