const { ESLintUtils } = require('@typescript-eslint/utils');
const path = require('path');
const { buildModelToDomainMapping, extractModuleFromPath, isPrismaModelName, camelToPascalCase } = require('../utils/schema-parser');

/**
 * ESLint rule to prevent NestJS modules from accessing Prisma models 
 * that belong to other domains
 */

const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/synapsestudios/eslint-plugin-data-boundaries#${name}`
);

module.exports = createRule({
  name: 'no-cross-domain-prisma-access',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow modules from accessing Prisma models defined in other domain schema files',
      recommended: 'recommended'
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          schemaDir: {
            type: 'string',
            description: 'Directory containing Prisma schema files (relative to project root)'
          },
          allowSharedModels: {
            type: 'boolean',
            description: 'Allow access to models in shared/main schema files'
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      crossDomainAccess: "Module '{{currentModule}}' cannot access '{{modelName}}' model (belongs to '{{modelDomain}}' domain). Consider using a shared service or moving the logic to the appropriate domain.",
      modelNotFound: "Model '{{modelName}}' not found in any schema file. Ensure the model exists and schema files are properly configured.",
      configError: "Could not determine schema directory. Please configure the 'schemaDir' option in your ESLint config."
    }
  },
  defaultOptions: [
    {
      schemaDir: 'prisma/schema',
      allowSharedModels: true
    }
  ],
  create(context, [options]) {
    const filename = context.getFilename();
    
    // Only process TypeScript files in modules
    if (!filename.includes('/modules/') || !filename.match(/\.(ts|tsx)$/)) {
      return {};
    }
    
    // Extract current module from file path
    const currentModule = extractModuleFromPath(filename);
    if (!currentModule) {
      return {};
    }
    
    // Build model-to-domain mapping
    let modelToDomain = {};
    try {
      let schemaDir;
      if (path.isAbsolute(options.schemaDir)) {
        // Use absolute path directly (for tests)
        schemaDir = options.schemaDir;
      } else {
        // Resolve relative to project root (for real usage)
        const projectRoot = findProjectRoot(filename);
        schemaDir = path.join(projectRoot, options.schemaDir);
      }
      modelToDomain = buildModelToDomainMapping(schemaDir);
    } catch (error) {
      // Report configuration error only once per file
      let reportedConfigError = false;
      return {
        Program(node) {
          if (!reportedConfigError) {
            context.report({
              node,
              messageId: 'configError'
            });
            reportedConfigError = true;
          }
        }
      };
    }
    
    return {
      // Detect property access: prisma.user, this.prisma.organization, etc.
      MemberExpression(node) {
        // Check if this looks like Prisma client access
        if (!isPrismaClientAccess(node)) {
          return;
        }
        
        // Extract the model name from the property access
        const modelName = getModelNameFromMemberExpression(node);
        if (!modelName || !isPrismaModelName(modelName)) {
          return;
        }
        
        // Convert camelCase to PascalCase for schema lookup
        const pascalModelName = camelToPascalCase(modelName);
        
        // Check if model exists in schema files
        const modelDomain = modelToDomain[pascalModelName];
        if (!modelDomain) {
          context.report({
            node,
            messageId: 'modelNotFound',
            data: { modelName: pascalModelName }
          });
          return;
        }
        
        // Allow access to shared models if configured
        if (options.allowSharedModels && modelDomain === 'shared') {
          return;
        }
        
        // Check if current module matches model domain
        if (currentModule !== modelDomain) {
          context.report({
            node,
            messageId: 'crossDomainAccess',
            data: {
              currentModule,
              modelName: pascalModelName,
              modelDomain
            }
          });
        }
      }
    };
  }
});

/**
 * Check if a MemberExpression represents Prisma client access
 */
function isPrismaClientAccess(node) {
  // Direct access: prisma.user
  if (node.object && node.object.type === 'Identifier' && node.object.name === 'prisma') {
    return true;
  }
  
  // Property access: this.prisma.user, service.prisma.user
  if (node.object && node.object.type === 'MemberExpression') {
    return node.object.property && 
           node.object.property.type === 'Identifier' && 
           node.object.property.name === 'prisma';
  }
  
  return false;
}

/**
 * Extract model name from MemberExpression
 */
function getModelNameFromMemberExpression(node) {
  if (node.property && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

/**
 * Find project root by looking for package.json
 */
function findProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  
  while (dir !== path.dirname(dir)) {
    if (require('fs').existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  
  throw new Error('Could not find project root');
}