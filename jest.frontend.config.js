/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/test/frontend'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/test/frontend/setup.js'],
};
