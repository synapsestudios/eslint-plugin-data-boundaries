module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts'
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { diagnostics: false, tsconfig: { allowJs: true } }],
  },
  moduleNameMapper: {
    '^@chevrotain/(.*)$': '<rootDir>/node_modules/@chevrotain/$1/lib/src/api.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: ['/node_modules/(?!(chevrotain|@chevrotain|lodash-es)/)'],
};
