module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/index.js'
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage'
};