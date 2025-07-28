# @synapsestudios/eslint-plugin-data-boundaries

ESLint plugin to enforce data boundary policies in modular monoliths using Prisma ORM.

## Overview

When building modular monoliths, maintaining clear boundaries between domains is crucial for long-term maintainability. ORMs like Prisma make it easy to accidentally create tight coupling at the data layer by allowing modules to access models that belong to other domains.

This ESLint plugin provides two complementary rules to prevent such violations:

1. **Schema-level enforcement**: Prevents Prisma schema files from referencing models defined in other schema files
2. **Application-level enforcement**: Prevents TypeScript code from accessing Prisma models outside their domain boundaries

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
        '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
          schemaDir: 'prisma/schema',
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
      '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': [
        'error',
        { 
          schemaDir: 'prisma/schema', 
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

### Schema Structure
```
prisma/
  schema/
    auth.prisma         # Contains User, Session models
    organization.prisma # Contains Organization, Membership models
    main.prisma         # Contains shared models (AuditLog, Setting)
```

## Domain Mapping

The plugin automatically maps:

- **File paths to domains**: `/modules/auth/` → `auth` domain
- **Schema files to domains**: `auth.prisma` → `auth` domain
- **Special cases**: `main.prisma` and `schema.prisma` → `shared` domain

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

## Migration Strategy

1. **Start with schema boundaries**: Add the `no-cross-file-model-references` rule to prevent new violations in schema files
2. **Split your schema**: Gradually move models to domain-specific schema files
3. **Add application boundaries**: Enable `no-cross-domain-prisma-access` to prevent cross-domain access in application code
4. **Refactor violations**: Create shared services or move logic to appropriate domains

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