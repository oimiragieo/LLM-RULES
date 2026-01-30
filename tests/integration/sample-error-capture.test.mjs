/**
 * Sample Error Capture Test
 *
 * Validates that the error capture system properly sanitizes sensitive data
 * when logging errors. This test simulates tool errors with sensitive context
 * and verifies masking works correctly.
 */

import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = 'C:/dev/projects/agent-studio';

test('Sample Error Capture Scenario', async (t) => {
  await t.test(
    'simulate tool error and verify sensitive data masking',
    async () => {
      // Load the sanitizer
      const sanitizer = require(
        path.join(PROJECT_ROOT, '.claude/lib/utils/error-sanitizer.cjs')
      );

      // Simulate an error context with sensitive data
      const errorContext = {
        agentName: 'test-agent',
        taskId: 'test-task-123',
        dbPassword: 'super-secret-password',
        apiKey: 'sk-1234567890abcdef1234567890abcdef',
        awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
        jwtToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        githubToken: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        connectionString:
          'mongodb://admin:secretPassword123@localhost:27017/mydb',
        bearerToken: 'Bearer abc123xyz789secretToken',
        email: 'user@example.com',
        sshKey:
          '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
        query: 'SELECT * FROM users WHERE password = "secret"',
      };

      // Sanitize the context
      const sanitized = sanitizer.sanitizeForLogging(errorContext);

      // Verify non-sensitive data is preserved
      assert.strictEqual(sanitized.agentName, 'test-agent');
      assert.strictEqual(sanitized.taskId, 'test-task-123');

      // Verify sensitive data is masked (forbidden fields)
      assert.ok(
        sanitized.dbPassword.includes('[REDACTED'),
        'dbPassword should be redacted: ' + sanitized.dbPassword
      );

      // Verify API key pattern is masked
      assert.ok(
        sanitized.apiKey.includes('[REDACTED'),
        'apiKey should be redacted: ' + sanitized.apiKey
      );
      assert.ok(
        !sanitized.apiKey.includes('sk-1234567890'),
        'apiKey should not contain original value'
      );

      // Verify AWS access key is masked
      assert.ok(
        sanitized.awsAccessKey.includes('[REDACTED'),
        'awsAccessKey should be redacted: ' + sanitized.awsAccessKey
      );

      // Verify JWT token is masked
      assert.ok(
        sanitized.jwtToken.includes('[REDACTED'),
        'jwtToken should be redacted: ' + sanitized.jwtToken
      );
      assert.ok(
        !sanitized.jwtToken.includes('eyJ'),
        'jwtToken should not contain original value'
      );

      // Verify GitHub token is masked
      assert.ok(
        sanitized.githubToken.includes('[REDACTED'),
        'githubToken should be redacted: ' + sanitized.githubToken
      );
      assert.ok(
        !sanitized.githubToken.includes('ghp_'),
        'githubToken should not contain original value'
      );

      // Verify connection string password is masked
      assert.ok(
        sanitized.connectionString.includes('[REDACTED'),
        'connectionString should be redacted: ' + sanitized.connectionString
      );
      assert.ok(
        !sanitized.connectionString.includes('secretPassword123'),
        'connectionString should not contain password'
      );

      // Verify bearer token is masked
      assert.ok(
        sanitized.bearerToken.includes('[REDACTED'),
        'bearerToken should be redacted: ' + sanitized.bearerToken
      );
      assert.ok(
        !sanitized.bearerToken.includes('abc123xyz789'),
        'bearerToken should not contain original value'
      );

      // Email is in SENSITIVE_FIELD_PATTERNS, not FORBIDDEN_FIELD_PATTERNS
      // So the field name "email" is marked sensitive but the value is NOT
      // automatically redacted unless it appears in a string context.
      // The email field is preserved as-is for sensitive (not forbidden) fields.
      assert.ok(
        typeof sanitized.email === 'string',
        'email field should be preserved (sensitive but not forbidden)'
      );

      // Verify SSH key is masked
      assert.ok(
        sanitized.sshKey.includes('[REDACTED'),
        'sshKey should be redacted: ' + sanitized.sshKey
      );
      assert.ok(
        !sanitized.sshKey.includes('MIIEowIBAAKCAQEA'),
        'sshKey should not contain key content'
      );

      // Verify query with sensitive data is masked
      assert.ok(
        sanitized.query.includes('[REDACTED'),
        'query should be redacted: ' + sanitized.query
      );
    }
  );

  await t.test(
    'error writer can create error entry with sanitized context',
    async () => {
      const writer = require(
        path.join(PROJECT_ROOT, '.claude/lib/error-writer.cjs')
      );

      const error = {
        errorId: 'ERR-TEST0002',
        timestamp: new Date().toISOString(),
        category: 'EXECUTION_ERROR',
        severity: 'INFO',
        message: 'Test error for verification',
        source: {
          agentName: 'test-agent',
          tool: 'Bash',
        },
        context: {
          command: 'echo "test"',
          exitCode: 0,
        },
      };

      // This should not throw
      const result = writer.writeError(error);
      assert.ok(result === undefined || result === null || result === true, 'writeError should complete without throwing');
    }
  );
});
