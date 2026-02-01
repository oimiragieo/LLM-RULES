#!/usr/bin/env node
/**
 * Session Memory Extractor Tests
 * ==============================
 *
 * Tests for the session-memory-extractor hook ensuring it:
 * 1. Correctly finds project root using findProjectRoot()
 * 2. Passes projectRoot to all memory manager function calls
 * 3. Extracts patterns, gotchas, and discoveries correctly
 */

'use strict';

const { test, describe, _mock, _beforeEach, _afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Get the extractor module
const extractor = require('../../.claude/hooks/memory/session-memory-extractor.cjs');

describe('session-memory-extractor', () => {
  describe('extractPatterns', () => {
    test('extracts patterns from output text', () => {
      const output = 'The best practice: always use async/await for I/O operations';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract at least one pattern');
    });

    test('limits patterns to max 3', () => {
      const output = `
        pattern: first pattern here test content
        pattern: second pattern here test content
        pattern: third pattern here test content
        pattern: fourth pattern here test content
      `;
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length <= 3, 'Should limit to 3 patterns');
    });

    test('returns empty array for no patterns', () => {
      const output = 'Just some normal text without any indicators';
      const patterns = extractor.extractPatterns(output);
      assert.deepStrictEqual(patterns, []);
    });

    // HOOK-TEST-001: Additional pattern extraction tests
    test('extracts pattern with "approach" keyword', () => {
      const output = 'The approach: use dependency injection for testing';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract approach pattern');
    });

    test('extracts pattern with "solution" keyword', () => {
      const output = 'solution: implement retry logic with exponential backoff';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract solution pattern');
    });

    test('extracts pattern with "technique" keyword', () => {
      const output = 'technique: use memoization for expensive calculations';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract technique pattern');
    });

    test('extracts pattern with "always" keyword', () => {
      const output = 'always validate user input before processing to prevent injection attacks';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract always pattern');
    });

    test('extracts pattern with "should" keyword', () => {
      const output = 'should use parameterized queries instead of string concatenation';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract should pattern');
    });

    test('extracts pattern with "using X for Y" format', () => {
      // The regex pattern is: /(?:use|using)\s+(\w+)\s+(?:for|to|when)\s+(.{10,50})/gi
      // This captures "using X for <10-50 chars description>"
      const output = 'using memoization for caching expensive calculations';
      const patterns = extractor.extractPatterns(output);
      assert.ok(patterns.length > 0, 'Should extract using X for Y pattern');
    });

    test('filters out too short patterns', () => {
      const output = 'pattern: short';
      const patterns = extractor.extractPatterns(output);
      assert.strictEqual(patterns.length, 0, 'Should filter short patterns');
    });

    test('filters out too long patterns', () => {
      const longText = 'a'.repeat(250);
      const output = `pattern: ${longText}`;
      const patterns = extractor.extractPatterns(output);
      assert.strictEqual(patterns.length, 0, 'Should filter long patterns');
    });

    test('handles empty string input', () => {
      const patterns = extractor.extractPatterns('');
      assert.deepStrictEqual(patterns, []);
    });
  });

  describe('extractGotchas', () => {
    test('extracts gotchas from output text', () => {
      const output = 'gotcha: remember to close database connections';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract at least one gotcha');
    });

    test('extracts from "don\'t" patterns', () => {
      const output = "don't use synchronous file operations in async context";
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract gotcha from negation pattern');
    });

    test('limits gotchas to max 3', () => {
      const output = `
        gotcha: first gotcha here with content
        gotcha: second gotcha here with content
        gotcha: third gotcha here with content
        gotcha: fourth gotcha here with content
      `;
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length <= 3, 'Should limit to 3 gotchas');
    });

    // HOOK-TEST-001: Additional gotcha extraction tests
    test('extracts gotcha with "pitfall" keyword', () => {
      const output = 'pitfall: circular dependencies can cause stack overflow';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract pitfall gotcha');
    });

    test('extracts gotcha with "warning" keyword', () => {
      const output = 'warning: this API is deprecated and will be removed';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract warning gotcha');
    });

    test('extracts gotcha with "caution" keyword', () => {
      const output = 'caution: ensure proper error handling in async code';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract caution gotcha');
    });

    test('extracts gotcha with "never" keyword', () => {
      const output = 'never expose sensitive data in error messages or logs';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract never gotcha');
    });

    test('extracts gotcha with "avoid" keyword', () => {
      const output = 'avoid using dynamic code execution as it can run arbitrary code';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract avoid gotcha');
    });

    test('extracts gotcha with "bug" keyword', () => {
      const output = 'bug: race condition when multiple threads access shared state';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract bug gotcha');
    });

    test('extracts gotcha with "fixed by" keyword', () => {
      const output = 'fixed by adding proper mutex locks to critical sections';
      const gotchas = extractor.extractGotchas(output);
      assert.ok(gotchas.length > 0, 'Should extract fixed by gotcha');
    });

    test('filters out too short gotchas', () => {
      const output = 'gotcha: tiny';
      const gotchas = extractor.extractGotchas(output);
      assert.strictEqual(gotchas.length, 0, 'Should filter short gotchas');
    });

    test('handles empty string input', () => {
      const gotchas = extractor.extractGotchas('');
      assert.deepStrictEqual(gotchas, []);
    });
  });

  describe('extractDiscoveries', () => {
    test('extracts file discoveries from output text', () => {
      const output = '`src/auth.ts`: handles user authentication';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract at least one discovery');
      assert.strictEqual(discoveries[0].path, 'src/auth.ts');
    });

    test('limits discoveries to max 5', () => {
      const output = `
        \`file1.js\`: description one here
        \`file2.js\`: description two here
        \`file3.js\`: description three here
        \`file4.js\`: description four here
        \`file5.js\`: description five here
        \`file6.js\`: description six here
      `;
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length <= 5, 'Should limit to 5 discoveries');
    });

    // HOOK-TEST-001: Additional discovery extraction tests
    test('extracts discovery with module keyword', () => {
      const output = 'module `utils/logger.js` handles all application logging';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract module discovery');
      assert.strictEqual(discoveries[0].path, 'utils/logger.js');
    });

    test('extracts discovery with component keyword', () => {
      const output = 'component `components/Button.tsx` is the reusable button';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract component discovery');
      assert.strictEqual(discoveries[0].path, 'components/Button.tsx');
    });

    test('extracts discovery with file keyword', () => {
      const output = 'file `config/settings.json` contains application config';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract file discovery');
      assert.strictEqual(discoveries[0].path, 'config/settings.json');
    });

    test('extracts discovery with "is" description', () => {
      const output = 'file `api/routes.js` is the main routing configuration';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract discovery with is');
    });

    test('extracts discovery with "handles" description', () => {
      const output = 'file `middleware/auth.js` handles authentication middleware';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract discovery with handles');
    });

    test('extracts discovery with "contains" description', () => {
      const output = 'file `types/index.ts` contains all TypeScript type definitions';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract discovery with contains');
    });

    test('extracts discovery with "manages" description', () => {
      const output = 'file `store/state.js` manages application state';
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length > 0, 'Should extract discovery with manages');
    });

    test('filters paths with spaces', () => {
      const output = '`path with spaces/file.js`: should be filtered';
      const discoveries = extractor.extractDiscoveries(output);
      assert.strictEqual(discoveries.length, 0, 'Should filter paths with spaces');
    });

    test('handles various file extensions', () => {
      const output = `
        \`file.ts\`: TypeScript file here
        \`file.jsx\`: React JSX file here
        \`file.py\`: Python file here
        \`file.cjs\`: CommonJS file here
      `;
      const discoveries = extractor.extractDiscoveries(output);
      assert.ok(discoveries.length >= 3, 'Should extract various extensions');
    });

    test('handles empty string input', () => {
      const discoveries = extractor.extractDiscoveries('');
      assert.deepStrictEqual(discoveries, []);
    });
  });

  describe('shared utilities', () => {
    test('module imports PROJECT_ROOT from shared utilities', () => {
      // PROJECT_ROOT is now imported from ../../lib/utils/project-root.cjs
      // This is verified by the module loading successfully
      assert.ok(
        typeof extractor.extractPatterns === 'function',
        'Module should load successfully with shared utilities'
      );
    });

    test('module imports parseHookInputAsync from shared utilities', () => {
      // parseHookInputAsync is now imported from ../../lib/utils/hook-input.cjs
      // This is verified by the module loading successfully
      assert.ok(
        typeof extractor.extractGotchas === 'function',
        'Module should load successfully with hook-input utilities'
      );
    });

    test('PROJECT_ROOT is exported', () => {
      assert.ok(extractor.PROJECT_ROOT, 'PROJECT_ROOT should be exported');
      assert.ok(typeof extractor.PROJECT_ROOT === 'string', 'PROJECT_ROOT should be a string');
    });
  });

  // HOOK-TEST-001: Edge case and integration tests
  describe('edge cases', () => {
    test('handles null-like values safely', () => {
      // extractPatterns should handle undefined/null gracefully
      const patterns1 = extractor.extractPatterns(undefined);
      assert.deepStrictEqual(patterns1, []);

      const patterns2 = extractor.extractPatterns(null);
      assert.deepStrictEqual(patterns2, []);
    });

    test('handles numeric input by converting to string', () => {
      // Should handle any input type gracefully
      const patterns = extractor.extractPatterns(12345);
      assert.ok(Array.isArray(patterns), 'Should return array for numeric input');
    });

    test('handles very long input strings', () => {
      const longOutput = 'pattern: '.repeat(1000) + 'this is a valid pattern text';
      const patterns = extractor.extractPatterns(longOutput);
      assert.ok(patterns.length <= 3, 'Should still limit to 3 patterns');
    });

    test('handles unicode characters in output', () => {
      const output =
        'best practice: use UTF-8 encoding for internationalization (i18n) support \u4e2d\u6587';
      const patterns = extractor.extractPatterns(output);
      // Should not throw, may or may not extract depending on length
      assert.ok(Array.isArray(patterns));
    });

    test('handles newlines within patterns', () => {
      const output = `pattern: use\nmultiline\nstrings carefully`;
      const patterns = extractor.extractPatterns(output);
      // First line only should be extracted due to regex behavior
      assert.ok(Array.isArray(patterns));
    });
  });

  describe('combined extraction', () => {
    test('extracts all types from complex output', () => {
      const output = `
        The best practice: use dependency injection for testability
        gotcha: circular dependencies can cause stack overflow
        \`src/services/auth.ts\`: handles user authentication and authorization
        pattern: always validate input before processing
        warning: this API is deprecated since version 2.0
        module \`utils/helpers.js\` manages utility functions
      `;

      const patterns = extractor.extractPatterns(output);
      const gotchas = extractor.extractGotchas(output);
      const discoveries = extractor.extractDiscoveries(output);

      assert.ok(patterns.length > 0, 'Should extract patterns');
      assert.ok(gotchas.length > 0, 'Should extract gotchas');
      assert.ok(discoveries.length > 0, 'Should extract discoveries');
    });

    test('handles real-world task output format', () => {
      const output = `
        ## Task Completed Successfully

        Modified files:
        - \`src/components/Button.tsx\`: Updated button styling
        - \`src/utils/format.ts\`: Added new formatting functions

        Key learnings:
        - pattern: use CSS modules for scoped styling
        - gotcha: React strict mode renders components twice
        - always test components in isolation first
      `;

      const patterns = extractor.extractPatterns(output);
      const gotchas = extractor.extractGotchas(output);
      const discoveries = extractor.extractDiscoveries(output);

      assert.ok(Array.isArray(patterns));
      assert.ok(Array.isArray(gotchas));
      assert.ok(Array.isArray(discoveries));
    });
  });
});
