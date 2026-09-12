module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000,
  setupFiles: ['<rootDir>/tests/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/', '/src/seed/']
};
