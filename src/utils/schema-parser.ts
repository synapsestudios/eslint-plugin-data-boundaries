import { getSchema } from '@mrleebo/prisma-ast';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export interface ModelToDomainMapping {
  [modelName: string]: string;
}

/**
 * Parse all schema files in a directory and build model-to-domain mapping
 */
export function buildModelToDomainMapping(schemaDir: string): ModelToDomainMapping {
  const modelToDomain: ModelToDomainMapping = {};

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
      schema.list.forEach((item) => {
        if (item.type === 'model' && item.name) {
          modelToDomain[item.name] = domainName;
        }
      });
    }
  } catch (error) {
    // If we can't parse schemas, return empty mapping
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not parse schema files in ${schemaDir}:`, errorMessage);
  }

  return modelToDomain;
}

/**
 * Extract module name from file path
 */
export function extractModuleFromPath(
  filePath: string,
  modulePath: string = '/modules/'
): string | null {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedModulePath = modulePath.replace(/\\/g, '/');

  // Find the index of the module path
  const moduleIndex = normalizedPath.indexOf(normalizedModulePath);
  if (moduleIndex === -1) {
    return null;
  }

  // Extract everything after the module path
  const afterModulePath = normalizedPath.substring(moduleIndex + normalizedModulePath.length);

  // Get the first directory name after the module path
  const parts = afterModulePath.split('/').filter((part) => part.length > 0);
  return parts.length > 0 ? parts[0] : null;
}

/**
 * Check if a string looks like a Prisma model name (either camelCase or PascalCase)
 */
export function isPrismaModelName(name: string): boolean {
  // Should not be a common method/property name
  const commonMethods = [
    'findMany',
    'findFirst',
    'findUnique',
    'create',
    'update',
    'delete',
    'upsert',
    'count',
    'aggregate',
    'find',
    'get',
    'connect',
    'disconnect',
    'executeRaw',
    'queryRaw',
    'transaction',
  ];
  const commonProps = ['length', 'constructor', 'prototype', 'toString', 'valueOf'];

  if (commonMethods.includes(name) || commonProps.includes(name)) {
    return false;
  }

  // Must be non-empty, start with letter, contain only letters/numbers,
  // be more than just a single letter, and not be all uppercase
  return (
    name.length > 1 &&
    /^[A-Za-z][A-Za-z0-9]*$/.test(name) &&
    !/^\d/.test(name) &&
    name !== name.toUpperCase()
  ); // Not all uppercase
}

/**
 * Convert camelCase to PascalCase
 */
export function camelToPascalCase(camelCase: string): string {
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}
