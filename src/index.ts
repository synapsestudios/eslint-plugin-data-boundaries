const noCrossFileModelReferences = require('./rules/no-cross-file-model-references');
const noCrossDomainPrismaAccess = require('./rules/no-cross-domain-prisma-access');
const prismaParser = require('./parsers/prisma-parser');

module.exports = {
  rules: {
    'no-cross-file-model-references': noCrossFileModelReferences,
    'no-cross-domain-prisma-access': noCrossDomainPrismaAccess,
  },
  parsers: {
    prisma: prismaParser,
  },
  configs: {
    recommended: {
      plugins: ['@synapsestudios/data-boundaries'],
      overrides: [
        {
          files: ['**/*.prisma'],
          parser: '@synapsestudios/data-boundaries/dist/parsers/prisma-parser',
          rules: {
            '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error',
          },
        },
        {
          files: ['**/*.ts', '**/*.tsx'],
          rules: {
            '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': 'error',
          },
        },
      ],
    },
  },
};