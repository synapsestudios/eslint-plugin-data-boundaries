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
  
  async logAction(action: string) {
    return this.prisma.auditLog.create({ data: { action } }); // ✅ Valid: AuditLog is a shared model
  }
}
```

## Configuration

### Basic Setup

Add the plugin to your `.eslintrc.js`:

```javascript
module.exports = {
  plugins: ['@synapsestudios/data-boundaries'],
  overrides: [
    // For Prisma schema files
    {
      files: ['**/*.prisma'],
      parser: '@synapsestudios/data-boundaries/lib/parsers/prisma-parser',
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
          allowSharedModels: true
        }]
      }
    }
  ]
};
```

### Using the Recommended Configuration

```javascript
module.exports = {
  extends: ['plugin:@synapsestudios/data-boundaries/recommended']
};
```

### Rule Options

#### `no-cross-domain-prisma-access`

- **`schemaDir`** (string): Directory containing Prisma schema files, relative to project root. Default: `'prisma/schema'`
- **`allowSharedModels`** (boolean): Whether to allow access to models in shared/main schema files. Default: `true`

```javascript
{
  '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': ['error', {
    schemaDir: 'database/schemas',
    allowSharedModels: false
  }]
}
```

## Directory Structure

This plugin assumes your project follows these conventions:

### Module Structure
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

## Contributing

Issues and pull requests are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT

## Credits

Originally developed for internal use at Synapse Studios and opensourced for the community.