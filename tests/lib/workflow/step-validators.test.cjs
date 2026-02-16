#!/usr/bin/env node
/**
 * Step Validators Test Suite
 * ===========================
 *
 * Tests for step-validators.cjs
 * Follows TDD: These tests are written BEFORE implementation
 */

'use strict';

const path = require('path');
const fs = require('fs');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Simple test framework
const tests = [];
let passed = 0;
let failed = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  \x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  \x1b[31m✗\x1b[0m ${test.name}`);
      console.log(`    Error: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function _assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// =============================================================================
// Tests
// =============================================================================

// Import the module under test
let StepValidator, VALIDATOR_TYPES, validateGates, validateResearch;
let validateClaudeMdRegistration, _validateRouterEnforcerRegistration;
let validateSettingsJsonRegistration, validateSkillCatalogRegistration;
let validateFileExists, validateSchema;

try {
  const validators = require('../../../.claude/lib/workflow/step-validators.cjs');
  StepValidator = validators.StepValidator;
  VALIDATOR_TYPES = validators.VALIDATOR_TYPES;
  validateGates = validators.validateGates;
  validateResearch = validators.validateResearch;
  validateClaudeMdRegistration = validators.validateClaudeMdRegistration;
  _validateRouterEnforcerRegistration = validators.validateRouterEnforcerRegistration;
  validateSettingsJsonRegistration = validators.validateSettingsJsonRegistration;
  validateSkillCatalogRegistration = validators.validateSkillCatalogRegistration;
  validateFileExists = validators.validateFileExists;
  validateSchema = validators.validateSchema;
} catch (_e) {
  console.log('Module not found - tests will fail (expected before implementation)');
}

// =============================================================================
// VALIDATOR_TYPES Tests
// =============================================================================

describe('VALIDATOR_TYPES', () => {
  it('should define SCHEMA type', () => {
    assertEqual(VALIDATOR_TYPES.SCHEMA, 'schema');
  });

  it('should define ASSERTION type', () => {
    assertEqual(VALIDATOR_TYPES.ASSERTION, 'assertion');
  });

  it('should define RESEARCH type', () => {
    assertEqual(VALIDATOR_TYPES.RESEARCH, 'research');
  });

  it('should define FILE_EXISTS type', () => {
    assertEqual(VALIDATOR_TYPES.FILE_EXISTS, 'file_exists');
  });

  it('should define REGISTRATION type', () => {
    assertEqual(VALIDATOR_TYPES.REGISTRATION, 'registration');
  });

  it('should define CUSTOM type', () => {
    assertEqual(VALIDATOR_TYPES.CUSTOM, 'custom');
  });
});

// =============================================================================
// validateResearch Tests
// =============================================================================

describe('validateResearch', () => {
  it('should fail when no queries executed', () => {
    const context = { research: { queries: [], sources: [] } };
    const result = validateResearch(context);
    assertEqual(result.passed, false);
    assert(result.error.includes('queries'), 'Should mention queries in error');
  });

  it('should fail when fewer than 3 queries', () => {
    const context = {
      research: {
        queries: ['query1', 'query2'],
        sources: ['source1', 'source2', 'source3'],
      },
    };
    const result = validateResearch(context);
    assertEqual(result.passed, false);
    assert(result.error.includes('3'), 'Should mention minimum 3 queries');
  });

  it('should fail when fewer than 3 sources', () => {
    const context = {
      research: {
        queries: ['query1', 'query2', 'query3'],
        sources: ['source1', 'source2'],
      },
    };
    const result = validateResearch(context);
    assertEqual(result.passed, false);
    assert(result.error.includes('sources'), 'Should mention sources in error');
  });

  it('should fail when no report file exists', () => {
    const context = {
      research: {
        queries: ['q1', 'q2', 'q3'],
        sources: ['s1', 's2', 's3'],
        reportFile: '/nonexistent/path/report.md',
      },
    };
    const result = validateResearch(context);
    assertEqual(result.passed, false);
    assert(result.error.includes('report'), 'Should mention report in error');
  });

  it('should pass with valid research', () => {
    // Create a temp file to test
    const tempDir = path.join(__dirname, '..', 'context', 'artifacts', 'research-reports');
    const tempFile = path.join(tempDir, 'test-report-validators.md');

    // Ensure directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a test report with required sections
    fs.writeFileSync(
      tempFile,
      `# Test Report
## Executive Summary
Test summary
## Sources
- Source 1
- Source 2
- Source 3
## Recommendations
Test recommendations
`
    );

    try {
      const context = {
        research: {
          queries: ['q1', 'q2', 'q3'],
          sources: ['s1', 's2', 's3'],
          reportFile: tempFile,
        },
      };
      const result = validateResearch(context);
      assertEqual(result.passed, true, `Expected passed=true, got error: ${result.error}`);
    } finally {
      // Cleanup
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});

// =============================================================================
// validateFileExists Tests
// =============================================================================

describe('validateFileExists', () => {
  it('should pass when file exists', () => {
    const result = validateFileExists(__filename);
    assertEqual(result.passed, true);
  });

  it('should fail when file does not exist', () => {
    const result = validateFileExists('/nonexistent/file/path.txt');
    assertEqual(result.passed, false);
    assert(result.error.includes('not exist'), 'Should mention file does not exist');
  });
});

// =============================================================================
// validateSchema Tests
// =============================================================================

describe('validateSchema', () => {
  it('should pass valid data against schema', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };
    const data = { name: 'test' };
    const result = validateSchema(data, schema);
    assertEqual(result.passed, true);
  });

  it('should fail when required field missing', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };
    const data = {};
    const result = validateSchema(data, schema);
    assertEqual(result.passed, false);
    assert(result.error.includes('name'), 'Should mention missing field');
  });

  it('should fail when type is wrong', () => {
    const schema = {
      type: 'object',
      properties: {
        age: { type: 'number' },
      },
    };
    const data = { age: 'not a number' };
    const result = validateSchema(data, schema);
    assertEqual(result.passed, false);
    assert(result.error.includes('type'), 'Should mention type error');
  });
});

// =============================================================================
// Registration Validator Tests
// =============================================================================

describe('validateClaudeMdRegistration', () => {
  it('should pass when artifact is in CLAUDE.md', () => {
    // 'developer' should be in the routing table
    const result = validateClaudeMdRegistration('developer', 'agents');
    assertEqual(result.passed, true);
  });

  it('should fail when artifact not in CLAUDE.md', () => {
    const result = validateClaudeMdRegistration('nonexistent-agent-xyz123', 'agents');
    assertEqual(result.passed, false);
    assert(result.error.includes('not found'), 'Should mention not found');
  });
});

describe('validateSettingsJsonRegistration', () => {
  it('should fail when hook not registered in settings.json', () => {
    const result = validateSettingsJsonRegistration('nonexistent-hook-xyz123');
    assertEqual(result.passed, false);
  });

  it('should fail gracefully when settings.json is malformed', () => {
    const settingsPath = path.join(PROJECT_ROOT, '.claude', 'settings.json');
    const original = fs.readFileSync(settingsPath, 'utf8');
    fs.writeFileSync(settingsPath, '{bad json', 'utf8');
    try {
      const result = validateSettingsJsonRegistration('any-hook');
      assertEqual(result.passed, false);
      assert(
        typeof result.error === 'string' && result.error.length > 0,
        'Should return parse-safe error'
      );
    } finally {
      fs.writeFileSync(settingsPath, original, 'utf8');
    }
  });
});

describe('validateSkillCatalogRegistration', () => {
  it('should pass when skill exists in catalog', () => {
    const catalogPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'context',
      'artifacts',
      'skill-catalog.md'
    );
    const existed = fs.existsSync(catalogPath);
    const original = existed ? fs.readFileSync(catalogPath, 'utf8') : null;
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.writeFileSync(catalogPath, '# Skill Catalog\n\n- tdd\n', 'utf8');
    try {
      const result = validateSkillCatalogRegistration('tdd');
      assertEqual(result.passed, true);
    } finally {
      if (existed) {
        fs.writeFileSync(catalogPath, original, 'utf8');
      } else if (fs.existsSync(catalogPath)) {
        fs.unlinkSync(catalogPath);
      }
    }
  });

  it('should fail when skill not in catalog', () => {
    const result = validateSkillCatalogRegistration('nonexistent-skill-xyz123');
    assertEqual(result.passed, false);
  });
});

// =============================================================================
// StepValidator Class Tests
// =============================================================================

describe('StepValidator', () => {
  it('should create instance with default options', () => {
    const validator = new StepValidator();
    assert(validator !== null, 'Should create instance');
  });

  it('should validate step with assertion type', async () => {
    const validator = new StepValidator();
    const step = {
      id: 'test-step',
      validation: {
        type: 'assertion',
        condition: 'context.value > 0',
      },
    };
    const context = { value: 5 };
    const result = await validator.validate(step, context);
    assertEqual(result.passed, true);
  });

  it('should fail step validation when assertion fails', async () => {
    const validator = new StepValidator();
    const step = {
      id: 'test-step',
      validation: {
        type: 'assertion',
        condition: 'context.value > 10',
      },
    };
    const context = { value: 5 };
    const result = await validator.validate(step, context);
    assertEqual(result.passed, false);
  });

  it('should register and use custom validator', async () => {
    const validator = new StepValidator();
    validator.registerValidator('myCustom', (step, ctx) => {
      return { passed: ctx.customValue === 'expected' };
    });

    const step = {
      id: 'test-step',
      validation: {
        type: 'custom',
        validatorName: 'myCustom',
      },
    };
    const context = { customValue: 'expected' };
    const result = await validator.validate(step, context);
    assertEqual(result.passed, true);
  });

  it('should return last validation result', async () => {
    const validator = new StepValidator();
    const step = {
      id: 'test-step',
      validation: {
        type: 'assertion',
        condition: 'context.value === 42',
      },
    };
    await validator.validate(step, { value: 42 });
    const result = validator.getValidationResult();
    assertEqual(result.passed, true);
    assertEqual(result.stepId, 'test-step');
  });
});

// =============================================================================
// validateGates Tests
// =============================================================================

describe('validateGates', () => {
  it('should pass when all gates pass', () => {
    const gates = [
      { condition: 'steps.step1.output.success === true' },
      { condition: 'steps.step2.output.count > 0' },
    ];
    const context = {
      steps: {
        step1: { output: { success: true } },
        step2: { output: { count: 5 } },
      },
    };
    const result = validateGates(gates, context);
    assertEqual(result.passed, true);
    assertEqual(result.failures.length, 0);
  });

  it('should fail and collect failures when gates fail', () => {
    const gates = [
      { condition: 'steps.step1.output.success === true', name: 'gate1' },
      { condition: 'steps.step2.output.count > 10', name: 'gate2' },
    ];
    const context = {
      steps: {
        step1: { output: { success: true } },
        step2: { output: { count: 5 } },
      },
    };
    const result = validateGates(gates, context);
    assertEqual(result.passed, false);
    assertEqual(result.failures.length, 1);
    assertEqual(result.failures[0].gate.name, 'gate2');
  });

  it('should pass with empty gates array', () => {
    const result = validateGates([], {});
    assertEqual(result.passed, true);
    assertEqual(result.failures.length, 0);
  });
});

// =============================================================================
// Run Tests
// =============================================================================

runTests();
