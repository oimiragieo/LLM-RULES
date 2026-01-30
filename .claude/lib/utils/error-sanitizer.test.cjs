#!/usr/bin/env node
// @ts-check
/**
 * Tests for Error Sanitizer Library
 *
 * Validates that the error sanitizer properly masks sensitive data
 * according to SEC-LOG guidelines.
 *
 * @module lib/utils/error-sanitizer.test
 */

'use strict';

const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// We'll require the actual module once implemented
let sanitizer;

describe('error-sanitizer', () => {
  before(() => {
    // Clear any cached modules
    delete require.cache[require.resolve('./error-sanitizer.cjs')];
    sanitizer = require('./error-sanitizer.cjs');
  });

  describe('sanitizeForLogging()', () => {
    it('should export sanitizeForLogging function', () => {
      assert.strictEqual(typeof sanitizer.sanitizeForLogging, 'function');
    });

    it('should mask API keys (sk-...)', () => {
      const input = { data: 'Using key sk-abc123def456ghi789jkl012mno345pqr678' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.data.includes('sk-abc123'));
      assert.ok(result.data.includes('[REDACTED_API_KEY]'));
    });

    it('should mask AWS access keys (AKIA...)', () => {
      const input = { data: 'AWS key: AKIAIOSFODNN7EXAMPLE' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.data.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(result.data.includes('[REDACTED_API_KEY]'));
    });

    it('should mask JWT tokens (eyJ...)', () => {
      const input = { data: 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.data.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
      assert.ok(result.data.includes('[REDACTED_JWT_TOKEN]'));
    });

    it('should mask Bearer tokens', () => {
      const input = { header: 'Bearer abc123def456' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.header.includes('abc123def456'));
      assert.ok(result.header.includes('[REDACTED_BEARER_TOKEN]'));
    });

    it('should mask GitHub tokens (ghp_...)', () => {
      const input = { data: 'Using GitHub token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.data.includes('ghp_xxxxxxxxxxxx'));
      assert.ok(result.data.includes('[REDACTED_GITHUB_TOKEN]'));
    });

    it('should mask passwords in various formats', () => {
      const input1 = { data: 'password: secret123' };
      const input2 = { data: 'password=mysecret' };
      const input3 = { data: 'PASSWORD="supersecret"' };

      const result1 = sanitizer.sanitizeForLogging(input1);
      const result2 = sanitizer.sanitizeForLogging(input2);
      const result3 = sanitizer.sanitizeForLogging(input3);

      assert.ok(!result1.data.includes('secret123'));
      assert.ok(!result2.data.includes('mysecret'));
      assert.ok(!result3.data.includes('supersecret'));
      assert.ok(result1.data.includes('[REDACTED_PASSWORD]'));
    });

    it('should mask SSH private keys', () => {
      const input = { key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.key.includes('MIIEpAIBAAKCAQEA'));
      assert.ok(result.key.includes('[REDACTED_SSH_KEY]'));
    });

    it('should mask MongoDB connection strings', () => {
      const input = { url: 'mongodb://user:password@localhost:27017/db' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.url.includes('password'));
      assert.ok(result.url.includes('[REDACTED_CONNECTION_STRING]'));
    });

    it('should mask AWS ARNs', () => {
      const input = { arn: 'arn:aws:iam::123456789012:user/johndoe' };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.arn.includes('123456789012'));
      assert.ok(result.arn.includes('[REDACTED_AWS_ARN]'));
    });

    it('should handle nested objects', () => {
      const input = {
        level1: {
          level2: {
            secret: 'password: mysecret',
          },
        },
      };
      const result = sanitizer.sanitizeForLogging(input);
      assert.ok(!result.level1.level2.secret.includes('mysecret'));
    });

    it('should handle arrays', () => {
      const input = {
        tokens: ['ghp_aaaa', 'Bearer xyz', 'normal'],
      };
      const result = sanitizer.sanitizeForLogging(input);
      assert.strictEqual(result.tokens.length, 3);
      assert.ok(!result.tokens[0].includes('aaaa'));
      assert.ok(result.tokens[2] === 'normal');
    });

    it('should handle null and undefined', () => {
      const input = { a: null, b: undefined };
      const result = sanitizer.sanitizeForLogging(input);
      assert.strictEqual(result.a, null);
      assert.strictEqual(result.b, undefined);
    });

    it('should handle primitives', () => {
      assert.strictEqual(sanitizer.sanitizeForLogging('plain text'), 'plain text');
      assert.strictEqual(sanitizer.sanitizeForLogging(42), 42);
      assert.strictEqual(sanitizer.sanitizeForLogging(true), true);
    });
  });

  describe('maskEmail()', () => {
    it('should export maskEmail function', () => {
      assert.strictEqual(typeof sanitizer.maskEmail, 'function');
    });

    it('should mask email addresses', () => {
      const result = sanitizer.maskEmail('john.doe@example.com');
      assert.ok(!result.includes('john.doe'));
      assert.ok(result.includes('***'));
      assert.ok(result.includes('@'));
    });

    it('should handle short email usernames', () => {
      const result = sanitizer.maskEmail('j@x.com');
      assert.ok(result.includes('@'));
      assert.ok(result.includes('***'));
    });

    it('should return original if not valid email', () => {
      const result = sanitizer.maskEmail('not-an-email');
      assert.strictEqual(result, 'not-an-email');
    });
  });

  describe('maskPath()', () => {
    it('should export maskPath function', () => {
      assert.strictEqual(typeof sanitizer.maskPath, 'function');
    });

    it('should remove PROJECT_ROOT from paths', () => {
      // Set up environment for test
      const originalCwd = process.cwd();
      const result = sanitizer.maskPath(path.join(originalCwd, '.claude', 'skills', 'tdd'));
      assert.ok(!result.includes(originalCwd) || result.startsWith('.claude'));
    });

    it('should mask home directory paths', () => {
      const result = sanitizer.maskPath('/Users/johndoe/Documents/secret.txt');
      assert.ok(!result.includes('johndoe'));
      assert.ok(result.includes('[HOME]') || result.includes('[USER]'));
    });

    it('should mask Windows user paths', () => {
      const result = sanitizer.maskPath('C:\\Users\\JohnDoe\\AppData\\secret.txt');
      assert.ok(!result.includes('JohnDoe'));
    });
  });

  describe('maskStackTrace()', () => {
    it('should export maskStackTrace function', () => {
      assert.strictEqual(typeof sanitizer.maskStackTrace, 'function');
    });

    it('should limit stack trace to 3 frames', () => {
      const longStack = `Error: test
    at function1 (/path/to/file1.js:10:5)
    at function2 (/path/to/file2.js:20:10)
    at function3 (/path/to/file3.js:30:15)
    at function4 (/path/to/file4.js:40:20)
    at function5 (/path/to/file5.js:50:25)`;

      const result = sanitizer.maskStackTrace(longStack);
      assert.ok(Array.isArray(result));
      assert.ok(result.length <= 3);
    });

    it('should remove function arguments from stack frames', () => {
      const stackWithArgs = `Error: test
    at someFunction(arg1="secret", arg2=123) (/path/file.js:10:5)`;

      const result = sanitizer.maskStackTrace(stackWithArgs);
      // Should not contain function arguments
      if (result.length > 0) {
        assert.ok(!result[0].includes('secret'));
      }
    });

    it('should mask file paths in stack traces', () => {
      const stackWithUserPath = `Error: test
    at someFunction (/Users/johndoe/project/file.js:10:5)`;

      const result = sanitizer.maskStackTrace(stackWithUserPath);
      if (result.length > 0) {
        assert.ok(!result[0].includes('johndoe'));
      }
    });
  });

  describe('isForbidden()', () => {
    it('should export isForbidden function', () => {
      assert.strictEqual(typeof sanitizer.isForbidden, 'function');
    });

    it('should return true for password fields', () => {
      assert.strictEqual(sanitizer.isForbidden('password'), true);
      assert.strictEqual(sanitizer.isForbidden('userPassword'), true);
      assert.strictEqual(sanitizer.isForbidden('db_password'), true);
    });

    it('should return true for secret fields', () => {
      assert.strictEqual(sanitizer.isForbidden('secret'), true);
      assert.strictEqual(sanitizer.isForbidden('clientSecret'), true);
      assert.strictEqual(sanitizer.isForbidden('api_secret'), true);
    });

    it('should return true for key fields', () => {
      assert.strictEqual(sanitizer.isForbidden('apiKey'), true);
      assert.strictEqual(sanitizer.isForbidden('privateKey'), true);
      assert.strictEqual(sanitizer.isForbidden('ssh_key'), true);
    });

    it('should return true for credential fields', () => {
      assert.strictEqual(sanitizer.isForbidden('credentials'), true);
      assert.strictEqual(sanitizer.isForbidden('userCredentials'), true);
    });

    it('should return false for normal fields', () => {
      assert.strictEqual(sanitizer.isForbidden('name'), false);
      assert.strictEqual(sanitizer.isForbidden('email'), false);
      assert.strictEqual(sanitizer.isForbidden('taskId'), false);
    });
  });

  describe('getSensitivity()', () => {
    it('should export getSensitivity function', () => {
      assert.strictEqual(typeof sanitizer.getSensitivity, 'function');
    });

    it('should return forbidden for password/secret fields', () => {
      assert.strictEqual(sanitizer.getSensitivity('password'), 'forbidden');
      assert.strictEqual(sanitizer.getSensitivity('secret'), 'forbidden');
    });

    it('should return sensitive for email/phone fields', () => {
      assert.strictEqual(sanitizer.getSensitivity('email'), 'sensitive');
      assert.strictEqual(sanitizer.getSensitivity('phone'), 'sensitive');
      assert.strictEqual(sanitizer.getSensitivity('userEmail'), 'sensitive');
    });

    it('should return internal for internal fields', () => {
      assert.strictEqual(sanitizer.getSensitivity('stackTrace'), 'internal');
      assert.strictEqual(sanitizer.getSensitivity('internalId'), 'internal');
    });

    it('should return public for normal fields', () => {
      assert.strictEqual(sanitizer.getSensitivity('name'), 'public');
      assert.strictEqual(sanitizer.getSensitivity('taskId'), 'public');
      assert.strictEqual(sanitizer.getSensitivity('timestamp'), 'public');
    });
  });
});
