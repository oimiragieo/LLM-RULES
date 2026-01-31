/**
 * Jest Configuration
 *
 * @type {import('@jest/types').Config.InitialOptions}
 */

module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'cjs', 'mjs'],
  testMatch: ['**/tests/**/*.test.cjs', '**/tests/**/*.test.mjs'],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude.archive/',
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.claude.archive/'],
  collectCoverageFrom: [
    '.claude/lib/**/*.{js,cjs,mjs}',
    '.claude/hooks/**/*.{js,cjs,mjs}',
    '.claude/tools/**/*.{js,cjs,mjs}',
    '!**/*.test.{js,cjs,mjs}',
    '!**/node_modules/**',
  ],
};
