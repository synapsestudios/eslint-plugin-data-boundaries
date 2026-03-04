const noCrossFileModelReferences = require('./rules/no-cross-file-model-references');
const noCrossDomainPrismaAccess = require('./rules/no-cross-domain-prisma-access');
const noCrossSchemaSlonikAccess = require('./rules/no-cross-schema-slonik-access');
const noCrossSchemaDrizzleReferences = require('./rules/no-cross-schema-drizzle-references');
const noCrossDomainDrizzleAccess = require('./rules/no-cross-domain-drizzle-access');
const prismaParser = require('./parsers/prisma-parser');

const plugin = {
  rules: {
    'no-cross-file-model-references': noCrossFileModelReferences,
    'no-cross-domain-prisma-access': noCrossDomainPrismaAccess,
    'no-cross-schema-slonik-access': noCrossSchemaSlonikAccess,
    'no-cross-schema-drizzle-references': noCrossSchemaDrizzleReferences,
    'no-cross-domain-drizzle-access': noCrossDomainDrizzleAccess,
  },
  parsers: {
    prisma: prismaParser,
  },
  configs: {} as Record<string, unknown>,
};

plugin.configs = {
  recommended: [
    {
      files: ['**/*.prisma'],
      languageOptions: { parser: prismaParser },
      plugins: { '@synapsestudios/data-boundaries': plugin },
      rules: {
        '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error',
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: { '@synapsestudios/data-boundaries': plugin },
      rules: {
        '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': 'error',
        '@synapsestudios/data-boundaries/no-cross-schema-slonik-access': 'error',
      },
    },
  ],
};

module.exports = plugin;
