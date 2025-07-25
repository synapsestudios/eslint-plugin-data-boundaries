const requireIndex = require('requireindex');

module.exports = {
  rules: requireIndex(__dirname + '/rules'),
  parsers: {
    prisma: require('./parsers/prisma-parser')
  },
  configs: {
    recommended: {
      plugins: ['@synapsestudios/data-boundaries'],
      overrides: [
        {
          files: ['**/*.prisma'],
          parser: require.resolve('./parsers/prisma-parser'),
          rules: {
            '@synapsestudios/data-boundaries/no-cross-file-model-references': 'error'
          }
        },
        {
          files: ['**/*.ts', '**/*.tsx'],
          rules: {
            '@synapsestudios/data-boundaries/no-cross-domain-prisma-access': 'error'
          }
        }
      ]
    }
  }
};