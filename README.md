# @synapsestudios/eslint-plugin-data-boundaries

ESLint plugin to enforce data boundary policies in modular monoliths using Prisma ORM, Drizzle ORM, and slonik.

## Rules

| Rule | Description | Scope |
|------|-------------|-------|
| [`no-cross-file-model-references`](#no-cross-file-model-references) | Prevents Prisma models from referencing models defined in other schema files | Prisma schema files |
| [`no-cross-domain-prisma-access`](#no-cross-domain-prisma-access) | Prevents modules from accessing Prisma models outside their domain boundaries | TypeScript/JavaScript |
| [`no-cross-schema-drizzle-references`](#no-cross-schema-drizzle-references) | Prevents Drizzle table definitions from referencing tables in other schema files | Drizzle schema files |
| [`no-cross-domain-drizzle-access`](#no-cross-domain-drizzle-access) | Prevents modules from accessing Drizzle tables outside their domain boundaries | TypeScript/JavaScript |
| [`no-cross-schema-slonik-access`](#no-cross-schema-slonik-access) | Prevents modules from accessing database tables outside their schema boundaries via slonik | TypeScript/JavaScript |

## Overview

When building modular monoliths, maintaining clear boundaries between domains is crucial for long-term maintainability. ORMs like Prisma and Drizzle and query builders like slonik make it easy to accidentally create tight coupling at the data layer by allowing modules to access data that belongs to other domains.

This ESLint plugin provides five complementary rules to prevent such violations:

1. **Prisma schema-level enforcement**: Prevents Prisma schema files from referencing models defined in other schema files
2. **Prisma application-level enforcement**: Prevents TypeScript code from accessing Prisma models outside their domain boundaries
3. **Drizzle schema-level enforcement**: Prevents Drizzle table definitions from referencing tables in other schema files
4. **Drizzle application-level enforcement**: Prevents TypeScript code from accessing Drizzle tables outside their domain boundaries
5. **SQL-level enforcement**: Prevents slonik SQL queries from accessing tables outside the module's schema

## Installation

```bash
npm install --save-dev @synapsestudios/eslint-plugin-data-boundaries
```

**Prerequisites**: If you're using TypeScript, you'll also need the TypeScript ESLint parser:

```bash
npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

## Rules

### `no-cross-file-model-references`

Prevents Prisma models from referencing models defined in other schema files. This rule works with Prisma's multi-file schema feature to ensure each schema file is self-contained within its domain.

**Examples of violations:**

```prisma
// membership.prisma
model UserOrganization {
  userId String
  user User @relation(...) // ❌ Error: User not defined in this file
}
```

**Valid usage:**

```prisma
// auth.prisma
model User {
  id String @id
  sessions Session[]
}

model Session {
  id String @id
  userId String
  user User @relation(fields: [userId], references: [id]) // ✅ Valid: User is defined in same file
}
```

### `no-cross-domain-prisma-access`

Prevents TypeScript/JavaScript modules from accessing Prisma models that belong to other domains. This rule analyzes your application code and maps file paths to domains, then ensures modules only access models from their own domain (plus optionally shared models).

**Examples of violations:**

```typescript
// In /modules/auth/service.ts
class AuthService {
  async getOrganizations() {
    return this.prisma.organization.findMany(); 
    // ❌ Error: Module 'auth' cannot access 'Organization' model (belongs to 'organization' domain)
  }
}
```

**Valid usage:**

```typescript
// In /modules/auth/service.ts  
class AuthService {
  async getUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } }); // ✅ Valid: User belongs to auth domain
  }
}
```

### `no-cross-schema-drizzle-references`

Prevents Drizzle table definitions from referencing tables defined in other schema files. This rule ensures that each Drizzle schema file is self-contained within its domain by detecting foreign key references and relations that cross schema file boundaries.

**Examples of violations:**

```typescript
// In execution.schema.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { identity_user } from './auth.schema';

export const execution = pgTable('execution', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => identity_user.id, { onDelete: 'cascade' }), // ❌ Error: identity_user not defined in this file
});
```

**Valid usage:**

```typescript
// In auth.schema.ts
import { pgTable, text } from 'drizzle-orm/pg-core';

export const identity_user = pgTable('identity_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const identity_session = pgTable('identity_session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => identity_user.id, { onDelete: 'cascade' }), // ✅ Valid: identity_user is defined in same file
});
```

### `no-cross-domain-drizzle-access`

Prevents TypeScript/JavaScript modules from accessing Drizzle tables that belong to other domains. This rule analyzes your application code and maps file paths to domains, then ensures modules only access tables from their own domain.

**Examples of violations:**

```typescript
// In /modules/auth/service.ts
import { organization } from '@/db/schema';

class AuthService {
  async getOrganizations() {
    return db.select().from(organization);
    // ❌ Error: Module 'auth' cannot access 'organization' table (belongs to 'organization' domain)
  }
}
```

**Valid usage:**

```typescript
// In /modules/auth/service.ts
import { identity_user, identity_session } from '@/db/schema';

class AuthService {
  async getUser(id: string) {
    return db.select().from(identity_user).where(eq(identity_user.id, id)); // ✅ Valid: identity_user belongs to auth domain
  }

  async getSessions(userId: string) {
    return db.select().from(identity_session).where(eq(identity_session.userId, userId)); // ✅ Valid: identity_session belongs to auth domain
  }
}
```

### `no-cross-schema-slonik-access`

Prevents TypeScript/JavaScript modules from accessing database tables outside their schema boundaries when using slonik. This rule enforces that all table references must be explicitly qualified with the module's schema name and prevents cross-schema access.

**Examples of violations:**

```typescript
// In /modules/auth/service.ts
import { sql } from 'slonik';

class AuthService {
  async getUser(id: string) {
    // ❌ Error: Module 'auth' must use fully qualified table names. Use 'auth.users' instead of 'users'.
    return await this.pool.query(sql`
      SELECT * FROM users WHERE id = ${id}
    `);
  }

  async getUserOrganizations(userId: string) {
    // ❌ Error: Module 'auth' cannot access table 'memberships' in schema 'organization'.
    return await this.pool.query(sql`
      SELECT * FROM organization.memberships WHERE user_id = ${userId}
    `);
  }
}
```

**Valid usage:**

```typescript
// In /modules/auth/service.ts
import { sql } from 'slonik';

class AuthService {
  async getUser(id: string) {
    // ✅ Valid: Fully qualified table name within module's schema
    return await this.pool.query(sql`
      SELECT * FROM auth.users WHERE id = ${id}
    `);
  }

  async getUserSessions(userId: string) {
    // ✅ Valid: Both tables are explicitly qualified with auth schema
    return await this.pool.query(sql`
      SELECT s.* FROM auth.sessions s
      JOIN auth.users u ON s.user_id = u.id
      WHERE u.id = ${userId}
    `);
  }
}
```

**Configuration:**

The rule supports the same `modulePath` configuration as other rules:

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-schema-slonik-access': ['error', {
    modulePath: '/modules/' // Default - change to '/src/' for NestJS projects
  }]
}
```

## Configuration

### Basic Setup (Legacy Config)

Add the plugin to your `.eslintrc.js`:

```javascript
module.exports = {
  // Base parser configuration for TypeScript
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
    // DO NOT add .prisma to extraFileExtensions - our custom parser handles these
  },
  plugins: ['@synapsestudios/data-boundaries'],
  overrides: [
    // For Prisma schema files - uses our custom parser
    {
      files: ['**/*.prisma'],
      parser: '@synapsestudios/eslint-plugin-data-boundaries/parsers/prisma',
      rules: {
        '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error'
      }
    },
    // For TypeScript application code
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Prisma rules
        '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
          schemaDir: 'prisma/schema',
          modulePath: '/modules/' // Default - change to '/src/' for NestJS projects
        }],
        // Drizzle rules
        '@synapsestudios/data-boundaries/no-cross-schema-drizzle-references': ['error', {
          schemaDir: 'src/db/schema', // Adjust to your Drizzle schema directory
        }],
        '@synapsestudios/data-boundaries/no-cross-domain-drizzle-access': ['error', {
          schemaDir: 'src/db/schema', // Adjust to your Drizzle schema directory
          modulePath: '/modules/' // Default - change to '/src/' for NestJS projects
        }],
        // Slonik rules
        '@synapsestudios/data-boundaries/no-cross-schema-slonik-access': ['error', {
          modulePath: '/modules/' // Default - change to '/src/' for NestJS projects
        }]
      }
    }
  ]
};
```

### Flat Config Setup (Recommended for New Projects)

For projects using ESLint's flat config (ESM), add to your `eslint.config.mjs`:

```javascript
import eslintPluginDataBoundaries from '@synapsestudios/eslint-plugin-data-boundaries';
import prismaParser from '@synapsestudios/eslint-plugin-data-boundaries/parsers/prisma';

export default [
  // 1. Global ignores first
  { 
    ignores: ['eslint.config.mjs', '**/*.prisma'] 
  },

  // 2. Prisma config - isolated and first
  {
    files: ['**/*.prisma'],
    ignores: [], // Override global ignore
    languageOptions: { 
      parser: prismaParser 
    },
    plugins: { 
      '@synapsestudios/data-boundaries': eslintPluginDataBoundaries 
    },
    rules: {
      '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error',
    },
  },

  // 3. Your existing TypeScript config here...
  
  // 4. TypeScript files rule config
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@synapsestudios/data-boundaries': eslintPluginDataBoundaries
    },
    rules: {
      // Prisma rules
      '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': [
        'error',
        {
          schemaDir: 'prisma/schema',
          modulePath: '/src/' // Use '/src/' for NestJS, '/modules/' for other structures
        }
      ],
      // Drizzle rules
      '@synapsestudios/data-boundaries/no-cross-schema-drizzle-references': [
        'error',
        {
          schemaDir: 'src/db/schema', // Adjust to your Drizzle schema directory
        }
      ],
      '@synapsestudios/data-boundaries/no-cross-domain-drizzle-access': [
        'error',
        {
          schemaDir: 'src/db/schema', // Adjust to your Drizzle schema directory
          modulePath: '/src/' // Use '/src/' for NestJS, '/modules/' for other structures
        }
      ],
      // Slonik rules
      '@synapsestudios/data-boundaries/no-cross-schema-slonik-access': [
        'error',
        {
          modulePath: '/src/' // Use '/src/' for NestJS, '/modules/' for other structures
        }
      ],
    },
  },
];
```

**⚠️ Flat Config Important Notes:**

1. **Parser isolation is critical** - Prisma config must be completely separate from TypeScript config
2. **Configuration order matters** - Place Prisma config before TypeScript config
3. **ESM imports** - The parser can be imported from the cleaner export path
4. **Global ignores + overrides** - Use global ignore for `.prisma` then override in Prisma-specific config

**⚠️ Important Configuration Note**: 

**Do NOT** add `.prisma` to `extraFileExtensions` in your main parser options. The plugin includes a custom parser specifically for `.prisma` files that handles Prisma schema syntax correctly. Adding `.prisma` to `extraFileExtensions` will cause the TypeScript parser to try parsing Prisma files, which will fail.

### Using the Recommended Configuration

```javascript
module.exports = {
  extends: ['plugin:@synapsestudios/data-boundaries/recommended']
};
```

### Rule Options

#### `no-cross-domain-prisma-access`

- **`schemaDir`** (string): Directory containing Prisma schema files, relative to project root. Default: `'prisma/schema'`
- **`modulePath`** (string): Path pattern to match module directories. Default: `'/modules/'`. Use `'/src/'` for NestJS projects or other domain-based structures.

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
    schemaDir: 'database/schemas',
    modulePath: '/src/' // For NestJS-style projects
  }]
}
```

#### `no-cross-schema-drizzle-references`

- **`schemaDir`** (string): Directory containing Drizzle schema files, relative to project root. Default: `'src/db/schema'`

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-schema-drizzle-references': ['error', {
    schemaDir: 'src/db/schema' // Adjust to your Drizzle schema directory
  }]
}
```

#### `no-cross-domain-drizzle-access`

- **`schemaDir`** (string): Directory containing Drizzle schema files, relative to project root. Default: `'src/db/schema'`
- **`modulePath`** (string): Path pattern to match module directories. Default: `'/modules/'`. Use `'/src/'` for NestJS projects or other domain-based structures.

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-domain-drizzle-access': ['error', {
    schemaDir: 'src/db/schema', // Adjust to your Drizzle schema directory
    modulePath: '/src/' // For NestJS-style projects
  }]
}
```

#### `no-cross-schema-slonik-access`

- **`modulePath`** (string): Path pattern to match module directories. Default: `'/modules/'`. Use `'/src/'` for NestJS projects or other domain-based structures.

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-schema-slonik-access': ['error', {
    modulePath: '/src/' // For NestJS-style projects
  }]
}
```

## Directory Structure

This plugin supports multiple project structures:

### Default Module Structure
```
src/
  modules/
    auth/           # auth domain
      service.ts
      controller.ts
    organization/   # organization domain  
      service.ts
      controller.ts
    user-profile/   # user-profile domain
      service.ts
```

### NestJS/Domain-Based Structure
```
src/
  auth/             # auth domain
    auth.service.ts
    auth.controller.ts
  organization/     # organization domain
    organization.service.ts
    organization.controller.ts
  user-profile/     # user-profile domain
    user-profile.service.ts
```

**Note**: For NestJS projects, set `modulePath: '/src/'` in your rule configuration.

### Prisma Schema Structure
```
prisma/
  schema/
    auth.prisma         # Contains User, Session models
    organization.prisma # Contains Organization, Membership models
    main.prisma         # Contains shared models (AuditLog, Setting)
```

### Drizzle Schema Structure
```
src/
  db/
    schema/
      auth.schema.ts         # Contains identity_user, identity_session tables
      organization.schema.ts # Contains organization table
      execution.schema.ts    # Contains execution, message, llmCall tables
      index.ts               # Barrel export for all schemas
```

## Domain Mapping

The plugin automatically maps:

### Prisma
- **File paths to domains**: `/modules/auth/` → `auth` domain
- **Schema files to domains**: `auth.prisma` → `auth` domain
- **Special cases**: `main.prisma` and `schema.prisma` → `shared` domain

### Drizzle
- **File paths to domains**: `/modules/auth/` → `auth` domain
- **Schema files to domains**: `auth.schema.ts` → `auth` domain
- **Table names to domains**: Extracted from schema file exports

## Use Cases

### Modular Monoliths
Perfect for applications transitioning from monolith to microservices, ensuring clean domain boundaries while maintaining a single codebase.

### Domain-Driven Design
Enforces DDD principles at the data layer, preventing cross-domain dependencies that can lead to tight coupling.

### Team Boundaries
Helps large teams maintain clear ownership of domains and prevents accidental coupling between team-owned modules.

### AI-Assisted Development
Particularly valuable when using AI coding tools, which can easily introduce unintended cross-domain dependencies.

## Error Messages

The plugin provides clear, actionable error messages:

```
Module 'auth' cannot access 'Organization' model (belongs to 'organization' domain). 
Consider using a shared service or moving the logic to the appropriate domain.
```

```
Model field 'user' references 'User' which is not defined in this file. 
Cross-file model references are not allowed.
```

```
Module 'auth' must use fully qualified table names. Use 'auth.users' instead of 'users'.
```

```
Module 'auth' cannot access table 'memberships' in schema 'organization'. 
SQL queries should only access tables within the module's own schema ('auth').
```

## Migration Strategy

1. **Start with schema boundaries**: Add the `no-cross-file-model-references` rule to prevent new violations in schema files
2. **Split your schema**: Gradually move models to domain-specific schema files
3. **Add application boundaries**: Enable `no-cross-domain-prisma-access` to prevent cross-domain access in application code
4. **Enforce SQL boundaries**: Enable `no-cross-schema-slonik-access` if using slonik to prevent cross-schema SQL queries
5. **Refactor violations**: Create shared services or move logic to appropriate domains

## Troubleshooting

### Common Issues

**Error: "extension for the file (.prisma) is non-standard"**

This happens when the TypeScript parser tries to parse `.prisma` files. **Do NOT add `.prisma` to `extraFileExtensions`**. Instead, make sure your configuration uses our custom parser for `.prisma` files:

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    // DO NOT add extraFileExtensions: ['.prisma'] here
  },
  plugins: ['@synapsestudios/data-boundaries'],
  overrides: [
    {
      files: ['**/*.prisma'],
      parser: '@synapsestudios/eslint-plugin-data-boundaries/parsers/prisma', // This handles .prisma files
      rules: {
        '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error'
      }
    }
  ]
};
```

**Error: "Could not determine schema directory"**

Make sure your `schemaDir` option points to the correct directory containing your Prisma schema files:

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
    schemaDir: 'prisma/schema', // Adjust this path as needed
      }]
}
```

**Rule not working on certain files**

The `no-cross-domain-prisma-access` rule only applies to files in directories that match the `modulePath` option. By default, this is `/modules/`. 

For **NestJS projects** or other domain-based structures, configure `modulePath: '/src/'`:

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
    schemaDir: 'prisma/schema',
    modulePath: '/src/', // ← Add this for NestJS projects
      }]
}
```

**Default structure** (`modulePath: '/modules/'`):
```
src/
  modules/
    auth/           # ✅ Will be checked
      service.ts
    organization/   # ✅ Will be checked
      service.ts
  utils/            # ❌ Will be ignored
    helper.ts
```

**NestJS structure** (`modulePath: '/src/'`):
```
src/
  auth/             # ✅ Will be checked
    auth.service.ts
  organization/     # ✅ Will be checked
    org.service.ts
  utils/            # ❌ Will be ignored
    helper.ts
```

## Contributing

Issues and pull requests are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT

## Credits

Originally developed for internal use at Synapse Studios and opensourced for the community.