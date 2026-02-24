#!/usr/bin/env node
/**
 * Validator Tests
 * ===============
 *
 * Comprehensive tests for the self-healing validator framework.
 * Tests validateOutput, validatePath, validateState, validateMemory functions.
 *
 * Run: node .claude/lib/self-healing/validator.test.cjs
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// =============================================================================
// Simple Test Framework
// =============================================================================

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  console.log('='.repeat(name.length));
  fn();
}

function it(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`  [PASS] ${name}`);
    testResults.push({ name, passed: true });
  } catch (error) {
    testsFailed++;
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    testResults.push({ name, passed: false, error: error.message });
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error('toContain only works on strings and arrays');
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toMatch(pattern) {
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    },
  };
}

// =============================================================================
// Test Setup
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_DIR = path.join(os.tmpdir(), 'validator-test-' + Date.now());

// Create temp directory
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Cleanup function
function cleanup() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch (_e) {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Import Module Under Test
// =============================================================================

let validator;
try {
  validator = require('../../../.claude/lib/self-healing/validator.cjs');
} catch (_e) {
  console.error('Cannot load validator.cjs - this is expected during RED phase');
  console.error('Create the module to continue testing.');
  process.exit(1);
}

const { validateOutput, validatePath, validateState, validateMemory } = validator;

// =============================================================================
// Tests: validateOutput
// =============================================================================

describe('validateOutput', () => {
  it('should validate data against simple schema with correct type', () => {
    const schema = { type: 'object', required: ['name'] };
    const data = { name: 'test-agent' };
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should fail when required field is missing', () => {
    const schema = { type: 'object', required: ['name', 'description'] };
    const data = { name: 'test' };
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('description');
  });

  it('should fail when type does not match', () => {
    const schema = { type: 'string' };
    const data = { name: 'test' };
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('type');
  });

  it('should validate nested objects', () => {
    const schema = {
      type: 'object',
      required: ['metadata'],
      properties: {
        metadata: { type: 'object' },
      },
    };
    const data = { metadata: { version: '1.0' } };
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(true);
  });

  it('should validate arrays', () => {
    const schema = { type: 'array' };
    const data = [1, 2, 3];
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(true);
  });

  it('should fail for array when object expected', () => {
    const schema = { type: 'object' };
    const data = [1, 2, 3];
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(false);
  });

  it('should handle null data gracefully', () => {
    const schema = { type: 'object' };
    const result = validateOutput(null, schema);
    expect(result.valid).toBe(false);
  });

  it('should handle undefined data gracefully', () => {
    const schema = { type: 'object' };
    const result = validateOutput(undefined, schema);
    expect(result.valid).toBe(false);
  });

  it('should validate common output types - agent', () => {
    const schema = {
      type: 'object',
      required: ['name', 'version', 'description'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
        description: { type: 'string' },
      },
    };
    const agentOutput = {
      name: 'developer',
      version: '1.0.0',
      description: 'TDD-focused implementer',
    };
    const result = validateOutput(agentOutput, schema);
    expect(result.valid).toBe(true);
  });

  it('should validate property types', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'number' },
        active: { type: 'boolean' },
      },
    };
    const data = { count: 'not-a-number', active: true };
    const result = validateOutput(data, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('count');
  });
});

// =============================================================================
// Tests: validatePath
// =============================================================================

describe('validatePath', () => {
  it('should validate path within PROJECT_ROOT', () => {
    const validPath = path.join(PROJECT_ROOT, '.claude', 'agents', 'test.md');
    const result = validatePath(validPath);
    expect(result.valid).toBe(true);
  });

  it('should reject path outside PROJECT_ROOT', () => {
    const invalidPath = '/etc/passwd';
    const result = validatePath(invalidPath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('outside');
  });

  it('should reject path traversal attempts with ../', () => {
    const traversalPath = path.join(PROJECT_ROOT, '.claude', '..', '..', 'outside.txt');
    const result = validatePath(traversalPath);
    // After normalization, this should be outside PROJECT_ROOT
    expect(result.valid).toBe(false);
    // The reason can be either "traversal" (if detected via ..) or "outside" (if detected via final check)
    expect(result.reason.toLowerCase()).toContain('outside');
  });

  it('should reject paths containing multiple consecutive dots', () => {
    const dotsPath = path.join(PROJECT_ROOT, '.claude', '...', 'hack.txt');
    const result = validatePath(dotsPath);
    expect(result.valid).toBe(false);
  });

  it('should allow valid relative path converted to absolute', () => {
    const relativePath = '.claude/skills/tdd/SKILL.md';
    const result = validatePath(relativePath, PROJECT_ROOT);
    expect(result.valid).toBe(true);
  });

  it('should reject empty path', () => {
    const result = validatePath('');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('should reject null path', () => {
    const result = validatePath(null);
    expect(result.valid).toBe(false);
  });

  it('should reject undefined path', () => {
    const result = validatePath(undefined);
    expect(result.valid).toBe(false);
  });

  it('should reject Windows path traversal on any platform', () => {
    const windowsTraversal = 'C:\\dev\\..\\..\\Windows\\System32\\config';
    const result = validatePath(windowsTraversal);
    expect(result.valid).toBe(false);
  });

  it('should accept subdirectory within .claude', () => {
    const validPath = path.join(PROJECT_ROOT, '.claude', 'lib', 'self-healing', 'validator.cjs');
    const result = validatePath(validPath);
    expect(result.valid).toBe(true);
  });

  it('should reject path with null bytes', () => {
    const nullBytePath = path.join(PROJECT_ROOT, '.claude', 'test\x00.txt');
    const result = validatePath(nullBytePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid character');
  });
});

// =============================================================================
// Tests: validateState
// =============================================================================

describe('validateState', () => {
  const validStateFile = path.join(TEMP_DIR, 'valid-state.json');
  const invalidStateFile = path.join(TEMP_DIR, 'invalid-state.json');
  const corruptStateFile = path.join(TEMP_DIR, 'corrupt-state.json');

  // Create test files
  const validState = {
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(validStateFile, JSON.stringify(validState, null, 2));

  const invalidState = {
    version: '1.0.0',
    state: 'invalid-state', // Invalid enum value
    evolutions: [],
  };
  fs.writeFileSync(invalidStateFile, JSON.stringify(invalidState, null, 2));

  fs.writeFileSync(corruptStateFile, '{ this is not valid JSON }');

  it('should validate well-formed evolution state file', () => {
    const result = validateState(validStateFile);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should fail for invalid state enum value', () => {
    const result = validateState(invalidStateFile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail for corrupt JSON', () => {
    const result = validateState(corruptStateFile);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('parse');
  });

  it('should fail for non-existent file', () => {
    const result = validateState('/non/existent/file.json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('should validate required fields are present', () => {
    const missingFieldsFile = path.join(TEMP_DIR, 'missing-fields.json');
    fs.writeFileSync(missingFieldsFile, JSON.stringify({ version: '1.0.0' }));
    const result = validateState(missingFieldsFile);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('state'))).toBe(true);
  });

  it('should validate state transitions are valid', () => {
    const invalidTransitionFile = path.join(TEMP_DIR, 'invalid-transition.json');
    const invalidTransitionState = {
      version: '1.0.0',
      state: 'enabling', // Can't be enabling without currentEvolution
      currentEvolution: null,
      evolutions: [],
      patterns: [],
      suggestions: [],
    };
    fs.writeFileSync(invalidTransitionFile, JSON.stringify(invalidTransitionState));
    const result = validateState(invalidTransitionFile);
    expect(result.valid).toBe(false);
  });

  it('should validate timestamps are reasonable', () => {
    const futureTimestampFile = path.join(TEMP_DIR, 'future-timestamp.json');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 100);
    const futureState = {
      ...validState,
      lastUpdated: futureDate.toISOString(),
    };
    fs.writeFileSync(futureTimestampFile, JSON.stringify(futureState));
    const result = validateState(futureTimestampFile);
    expect(result.valid).toBe(false);
    // Check for 'Timestamp' (capitalized) in the error message
    expect(result.errors[0]).toContain('Timestamp');
  });

  it('should accept empty arrays for evolutions/patterns/suggestions', () => {
    const emptyArraysFile = path.join(TEMP_DIR, 'empty-arrays.json');
    const emptyState = {
      version: '1.0.0',
      state: 'idle',
      currentEvolution: null,
      evolutions: [],
      patterns: [],
      suggestions: [],
    };
    fs.writeFileSync(emptyArraysFile, JSON.stringify(emptyState));
    const result = validateState(emptyArraysFile);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Tests: validateMemory
// =============================================================================

describe('validateMemory', () => {
  const validMemoryFile = path.join(TEMP_DIR, 'valid-learnings.md');
  const corruptMemoryFile = path.join(TEMP_DIR, 'corrupt-learnings.md');
  const oversizedMemoryFile = path.join(TEMP_DIR, 'oversized-learnings.md');
  const emptyMemoryFile = path.join(TEMP_DIR, 'empty-learnings.md');

  // Create valid markdown file
  const validMarkdown = `# Project Learnings

## [2026-01-25] Test Learning

This is a valid learning entry.

---

## Key Decisions

- Decision 1
- Decision 2
`;
  fs.writeFileSync(validMemoryFile, validMarkdown);

  // Create empty file
  fs.writeFileSync(emptyMemoryFile, '');

  // Create file with corruption markers
  const corruptMarkdown = `# Project Learnings

<<<<<<< HEAD
This is a merge conflict marker
=======
And this is the other side
>>>>>>> branch

Some content after corruption.
`;
  fs.writeFileSync(corruptMemoryFile, corruptMarkdown);

  // Create oversized file (simulate large file check)
  // For testing, we'll use a smaller threshold
  const largeContent = '# Large File\n' + 'x'.repeat(200000); // 200KB
  fs.writeFileSync(oversizedMemoryFile, largeContent);

  it('should validate well-formed markdown memory file', () => {
    const result = validateMemory(validMemoryFile);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should detect merge conflict markers as corruption', () => {
    const result = validateMemory(corruptMemoryFile);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('corruption') || e.includes('conflict'))).toBe(true);
  });

  it('should warn about oversized files', () => {
    const result = validateMemory(oversizedMemoryFile, { maxSizeKB: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('size');
  });

  it('should handle empty files', () => {
    const result = validateMemory(emptyMemoryFile);
    // Empty files are valid but may have a warning
    expect(result.valid).toBe(true);
  });

  it('should fail for non-existent file', () => {
    const result = validateMemory('/non/existent/memory.md');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('should check markdown structure - headings present', () => {
    const noHeadingsFile = path.join(TEMP_DIR, 'no-headings.md');
    fs.writeFileSync(noHeadingsFile, 'Just plain text with no structure.');
    const result = validateMemory(noHeadingsFile, { requireHeadings: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('heading');
  });

  it('should accept files with valid markdown headings', () => {
    const headingsFile = path.join(TEMP_DIR, 'with-headings.md');
    fs.writeFileSync(headingsFile, '# Main Title\n\n## Section\n\nContent here.');
    const result = validateMemory(headingsFile, { requireHeadings: true });
    expect(result.valid).toBe(true);
  });

  it('should detect other corruption patterns', () => {
    const nullBytesFile = path.join(TEMP_DIR, 'null-bytes.md');
    fs.writeFileSync(nullBytesFile, '# Title\n\nContent\x00with null bytes');
    const result = validateMemory(nullBytesFile);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('corruption');
  });
});

// =============================================================================
// Run Tests
// =============================================================================

// Print summary
console.log('\n' + '='.repeat(50));
console.log('TEST SUMMARY');
console.log('='.repeat(50));
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

// Cleanup temp files
cleanup();

// Exit with appropriate code
process.exit(testsFailed > 0 ? 1 : 0);
