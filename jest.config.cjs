/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // This repo's main test runner is Node's built-in `node --test` (see `pnpm test`).
  // Keep `npx jest` from accidentally picking up non-Jest tests/helpers.
  testMatch: ['**/?(*.)jest.test.[cm]js'],
  passWithNoTests: true,
  modulePathIgnorePatterns: [
    '<rootDir>/.claude.archive/',
    '<rootDir>/.claude.old/',
    '<rootDir>/.claude/staging/',
    '<rootDir>/.claude/lib/utils/.claude/staging/',
    '<rootDir>/tests/archive/',
  ],
  watchPathIgnorePatterns: ['<rootDir>/.claude.archive/', '<rootDir>/.claude.old/'],
};
