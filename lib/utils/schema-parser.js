const { getSchema } = require('@mrleebo/prisma-ast');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Parse all schema files in a directory and build model-to-domain mapping
 * @param {string} schemaDir - Directory containing schema files
 * @returns {Object} - { modelName: domainName } mapping
 */
function buildModelToDomainMapping(schemaDir) {
  const modelToDomain = {};
  
  try {
    // Find all .prisma files in the schema directory
    const schemaFiles = glob.sync(path.join(schemaDir, '**/*.prisma'));
    
    for (const filePath of schemaFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const schema = getSchema(content);
      
      // Extract domain name from filename (e.g., auth.prisma -> auth)
      const fileName = path.basename(filePath, '.prisma');
      const domainName = fileName === 'schema' || fileName === 'main' ? 'shared' : fileName;
      
      // Extract models from this schema file
      schema.list.forEach(item => {
        if (item.type === 'model' && item.name) {
          modelToDomain[item.name] = domainName;
        }
      });
    }
  } catch (error) {
    // If we can't parse schemas, return empty mapping
    console.warn(`Warning: Could not parse schema files in ${schemaDir}:`, error.message);
  }
  
  return modelToDomain;
}

/**
 * Extract module name from file path
 * @param {string} filePath - Full file path
 * @returns {string|null} - Module name or null if not in a module
 */
function extractModuleFromPath(filePath) {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Match patterns like /modules/auth/... or /src/modules/organization/...
  const moduleMatch = normalizedPath.match(/\/modules\/([^\/]+)/);
  return moduleMatch ? moduleMatch[1] : null;
}

/**
 * Check if a string looks like a Prisma model name (either camelCase or PascalCase)
 * @param {string} name - Name to check
 * @returns {boolean} - True if it looks like a model name
 */
function isPrismaModelName(name) {
  // Should not be a common method/property name
  const commonMethods = ['findMany', 'findFirst', 'findUnique', 'create', 'update', 'delete', 'upsert', 'count', 'aggregate', 'find', 'get', 'connect', 'disconnect', 'executeRaw', 'queryRaw', 'transaction'];
  const commonProps = ['length', 'constructor', 'prototype', 'toString', 'valueOf'];
  
  if (commonMethods.includes(name) || commonProps.includes(name)) {
    return false;
  }
  
  // Must be non-empty, start with letter, contain only letters/numbers, 
  // be more than just a single letter, and not be all uppercase
  return name.length > 1 && 
         /^[A-Za-z][A-Za-z0-9]*$/.test(name) && 
         !/^\d/.test(name) &&
         name !== name.toUpperCase(); // Not all uppercase
}

/**
 * Convert camelCase to PascalCase
 * @param {string} camelCase - camelCase string
 * @returns {string} - PascalCase string
 */
function camelToPascalCase(camelCase) {
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}

module.exports = {
  buildModelToDomainMapping,
  extractModuleFromPath,
  isPrismaModelName,
  camelToPascalCase
};