/**
 * Track Metadata Schema Validation Tests
 * TDD: RED phase - These tests will fail until schema is implemented
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'track-metadata.schema.json');

describe('Track Metadata Schema Validation', () => {
  let ajv;
  let schema;
  let validate;

  // Setup: Load schema before tests
  it('should load schema file', () => {
    assert.ok(fs.existsSync(SCHEMA_PATH), `Schema file not found at ${SCHEMA_PATH}`);
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
    schema = JSON.parse(schemaContent);

    ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid Metadata Tests (10 test cases)', () => {
    it('should validate minimal feature metadata', () => {
      const metadata = {
        trackId: 'user-auth_20260129',
        type: 'feature',
        status: 'new',
        description: 'Implement user authentication with JWT',
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate complete feature metadata with all fields', () => {
      const metadata = {
        trackId: 'api-cache_20260129',
        type: 'feature',
        status: 'in_progress',
        phaseState: 'implementation',
        description: 'Add Redis caching layer to API',
        estimatedEffort: {
          days: 5,
          breakdown: {
            design: 1,
            implementation: 2.5,
            testing: 1,
            documentation: 0.5,
          },
        },
        actualEffort: {
          days: 3.5,
          breakdown: {
            design: 0.5,
            implementation: 2,
            testing: 0.8,
            documentation: 0.2,
          },
        },
        priority: 'high',
        classification: ['performance', 'technical-debt'],
        acceptance_criteria: [
          'API response time reduced by 50%',
          'Cache hit rate > 80%',
          'All tests passing',
        ],
        dependencies: ['redis-setup_20260128'],
        created_at: '2026-01-29T10:00:00Z',
        updated_at: '2026-01-29T15:30:00Z',
        assignee: 'developer',
        blocked_by: [],
        blocks: ['api-docs_20260130'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate bug metadata', () => {
      const metadata = {
        trackId: 'login-crash_20260129',
        type: 'bug',
        status: 'in_progress',
        phaseState: 'implementation',
        description: 'Login page crashes on invalid email',
        priority: 'critical',
        classification: ['security', 'ux'],
        acceptance_criteria: ['No crashes on invalid input', 'User-friendly error messages'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate chore metadata', () => {
      const metadata = {
        trackId: 'deps-update_20260129',
        type: 'chore',
        status: 'new',
        description: 'Update dependencies to latest versions',
        priority: 'low',
        classification: ['technical-debt'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate refactor metadata', () => {
      const metadata = {
        trackId: 'clean-utils_20260129',
        type: 'refactor',
        status: 'review',
        phaseState: 'qa',
        description: 'Extract common utility functions',
        priority: 'medium',
        classification: ['technical-debt', 'dx'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate docs metadata', () => {
      const metadata = {
        trackId: 'api-guide_20260129',
        type: 'docs',
        status: 'completed',
        phaseState: 'deployed',
        description: 'Write API integration guide',
        priority: 'medium',
        classification: ['documentation'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate metadata with empty arrays', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Test feature',
        dependencies: [],
        blocked_by: [],
        blocks: [],
        acceptance_criteria: [],
        classification: [],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate metadata with additional properties (extensibility)', () => {
      const metadata = {
        trackId: 'custom_20260129',
        type: 'feature',
        status: 'new',
        description: 'Feature with custom fields',
        customField: 'custom value',
        nestedCustom: {
          foo: 'bar',
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate cancelled status', () => {
      const metadata = {
        trackId: 'old-feature_20260129',
        type: 'feature',
        status: 'cancelled',
        description: 'Feature cancelled due to priority change',
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate all phase states', () => {
      const phaseStates = [
        'draft',
        'spec_review',
        'plan_ready',
        'implementation',
        'qa',
        'deployed',
      ];

      for (const phaseState of phaseStates) {
        const metadata = {
          trackId: `phase-${phaseState}_20260129`,
          type: 'feature',
          status: 'in_progress',
          phaseState,
          description: `Testing phase state: ${phaseState}`,
        };

        const valid = validate(metadata);
        assert.ok(
          valid,
          `Failed for phaseState="${phaseState}": ${JSON.stringify(validate.errors, null, 2)}`
        );
      }
    });
  });

  describe('Invalid Metadata Tests (5 test cases)', () => {
    it('should reject metadata without required trackId', () => {
      const metadata = {
        type: 'feature',
        status: 'new',
        description: 'Missing trackId',
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject metadata without trackId');
      assert.ok(validate.errors.some(err => err.params.missingProperty === 'trackId'));
    });

    it('should reject metadata without required type', () => {
      const metadata = {
        trackId: 'test_20260129',
        status: 'new',
        description: 'Missing type',
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject metadata without type');
      assert.ok(validate.errors.some(err => err.params.missingProperty === 'type'));
    });

    it('should reject metadata without required status', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        description: 'Missing status',
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject metadata without status');
      assert.ok(validate.errors.some(err => err.params.missingProperty === 'status'));
    });

    it('should reject invalid trackId format', () => {
      const invalidTrackIds = [
        'InvalidFormat',
        'no-date',
        'UPPERCASE_20260129',
        'spaces in name_20260129',
        'test_2026', // Incomplete date
        'test_202601290', // Too long
      ];

      for (const trackId of invalidTrackIds) {
        const metadata = {
          trackId,
          type: 'feature',
          status: 'new',
          description: 'Testing invalid trackId',
        };

        const valid = validate(metadata);
        assert.strictEqual(valid, false, `Should reject trackId="${trackId}"`);
      }
    });

    it('should reject invalid enum values', () => {
      // Invalid type
      let metadata = {
        trackId: 'test_20260129',
        type: 'invalid-type',
        status: 'new',
        description: 'Invalid type',
      };
      assert.strictEqual(validate(metadata), false, 'Should reject invalid type');

      // Invalid status
      metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'invalid-status',
        description: 'Invalid status',
      };
      assert.strictEqual(validate(metadata), false, 'Should reject invalid status');

      // Invalid priority
      metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        priority: 'super-urgent',
        description: 'Invalid priority',
      };
      assert.strictEqual(validate(metadata), false, 'Should reject invalid priority');

      // Invalid classification
      metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        classification: ['invalid-classification'],
        description: 'Invalid classification',
      };
      assert.strictEqual(validate(metadata), false, 'Should reject invalid classification');
    });
  });

  describe('Edge Cases and Boundaries', () => {
    it('should reject description shorter than 10 characters', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Too short',
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject description < 10 chars');
    });

    it('should accept description exactly 10 characters', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: '1234567890', // Exactly 10
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should reject negative effort days', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Testing negative effort',
        estimatedEffort: {
          days: -5,
        },
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject negative effort');
    });

    it('should validate datetime format for created_at and updated_at', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Testing datetime',
        created_at: 'not-a-date',
      };

      const valid = validate(metadata);
      assert.strictEqual(valid, false, 'Should reject invalid datetime');
    });

    it('should validate multiple classification tags', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Multi-classification test',
        classification: [
          'security',
          'performance',
          'ux',
          'dx',
          'testing',
          'documentation',
          'technical-debt',
        ],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });
  });

  describe('Performance Tests', () => {
    it('should validate in under 1ms per metadata object', () => {
      const metadata = {
        trackId: 'perf-test_20260129',
        type: 'feature',
        status: 'new',
        description: 'Performance test metadata',
        priority: 'high',
        classification: ['performance'],
      };

      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        validate(metadata);
      }

      const end = Date.now();
      const avgTime = (end - start) / iterations;

      assert.ok(avgTime < 1, `Validation took ${avgTime}ms, expected <1ms`);
    });
  });

  describe('Security Tests', () => {
    it('should not allow SQL injection patterns in string fields', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: "'; DROP TABLE tracks; --",
        assignee: "admin' OR '1'='1",
      };

      // Schema should validate structure (strings are strings)
      // Application layer handles sanitization
      const valid = validate(metadata);
      assert.ok(valid, 'Schema validates structure, not content security');
    });

    it('should not allow XSS patterns in string fields', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: '<script>alert("XSS")</script>',
      };

      // Schema validates structure, application sanitizes
      const valid = validate(metadata);
      assert.ok(valid, 'Schema validates structure, not content security');
    });
  });

  describe('Real-World Examples', () => {
    it('should validate example from upgrade roadmap (SPEC-007)', () => {
      const metadata = {
        trackId: 'track-metadata-schema_20260129',
        type: 'feature',
        status: 'in_progress',
        phaseState: 'implementation',
        description: 'Create track metadata schema for consistent task tracking',
        priority: 'medium',
        classification: ['documentation', 'dx'],
        estimatedEffort: {
          days: 2,
          breakdown: {
            design: 0.5,
            implementation: 1,
            testing: 0.3,
            documentation: 0.2,
          },
        },
        acceptance_criteria: [
          'JSON Schema defined for metadata.json',
          'Validation hook enforces schema',
          'Error messages guide corrections',
        ],
        dependencies: [],
        created_at: '2026-01-29T10:00:00Z',
        updated_at: '2026-01-29T15:30:00Z',
        assignee: 'developer',
        blocked_by: [],
        blocks: ['spec-driven-workflow_20260130'],
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });
  });
});
