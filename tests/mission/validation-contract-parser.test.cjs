'use strict';

/**
 * Tests for validation-contract-parser.cjs
 *
 * Covers assertions:
 * - VAL-VC-001: Parses well-formed contract into executable checks
 * - VAL-VC-002: Duplicate rule IDs rejected
 * - VAL-VC-003: Malformed markdown degrades gracefully
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Module under test
const {
  parseValidationContract,
} = require('../../.claude/lib/mission/validation-contract-parser.cjs');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'validation-contract');

// Setup test fixtures
function createFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Well-formed contract with 5 rules
  const wellFormedContract = `# Validation Contract: Mission Engine Core

## Area: Mission Workspace Provisioner

### VAL-MC-001: Fresh workspace provisioning creates required directory tree
When \`provisionWorkspace({ missionId })\` is called with a valid UUID, the provisioner creates \`<root>/missions/<uuid>/\` with subdirectories \`artifacts/\`, \`handoffs/\`, \`logs/\`, \`state/\`. Pass: all four subdirectories exist. Fail: any subdirectory missing.
Evidence: unit-test(fs.existsSync on each path returns true)

### VAL-MC-002: Manifest file written with correct schema
After provisioning, \`<workspace>/manifest.json\` exists containing \`{ missionId, createdAt, version }\`. AJV schema validation passes. Pass: AJV validates. Fail: missing file or schema violation.
Evidence: unit-test(AJV validate returns true)

### VAL-MC-003: Parent directory auto-creation (recursive mkdir)
If \`.claude/missions/\` does not exist, provisioner creates it recursively. Pass: succeeds on fresh project root. Fail: throws ENOENT.
Evidence: unit-test(remove parent dir, provision, verify tree exists)

## Area: Features State Machine

### VAL-FS-001: Valid transition pending to in_progress succeeds
Calling \`transitionFeature(id, 'in_progress')\` on a pending feature succeeds, sets \`startedAt\` timestamp. Pass: status is \`in_progress\`. Fail: error or unchanged.
Evidence: unit-test(read features.json after transition)

### VAL-FS-002: Valid transition in_progress to completed succeeds
Feature in \`in_progress\` transitions to \`completed\`, sets \`completedAt\`. Pass: status is \`completed\`. Fail: error.
Evidence: unit-test(verify status and completedAt)
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'well-formed.md'), wellFormedContract);

  // Contract with duplicate IDs
  const duplicateContract = `# Validation Contract: Test Duplicates

## Area: Test Area

### VAL-TEST-001: First rule
Description for first rule.
Evidence: unit-test(something)

### VAL-TEST-002: Second rule
Description for second rule.
Evidence: unit-test(something else)

### VAL-TEST-001: Duplicate rule with same ID
This is a duplicate ID that should be rejected.
Evidence: unit-test(this should fail)
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'duplicates.md'), duplicateContract);

  // Malformed markdown - missing Evidence sections, broken format
  const malformedContract = `# Validation Contract: Malformed Test

## Area: Broken Area

### VAL-BRK-001: Rule without Evidence section
This rule is missing the Evidence line entirely.

### VAL-BRK-002: Valid rule with proper format
This has proper format.
Evidence: unit-test(this works)

### Broken line that doesn't match pattern
Not a valid rule header.

### VAL-BRK-003: Another valid rule
Another proper rule.
Evidence: unit-test(another test)
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'malformed.md'), malformedContract);

  // Empty contract
  const emptyContract = `# Validation Contract: Empty

No rules here, just a header.
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'empty.md'), emptyContract);

  // Contract with multiline descriptions
  const multilineContract = `# Validation Contract: Multiline Test

## Area: Complex Rules

### VAL-ML-001: Rule with multiline description
This is a description that spans
multiple lines and includes various
details about the validation rule.
Evidence: unit-test(multiline description parsed correctly)

### VAL-ML-002: Another multiline rule
Description line one.
Description line two.
Description line three.
Evidence: integration-test(full pipeline test)
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'multiline.md'), multilineContract);

  // Contract with various area prefixes
  const variousAreasContract = `# Validation Contract: Various Areas

## Area: Mission Core

### VAL-MC-100: Mission core rule
Mission core description.
Evidence: unit-test(mc test)

## Area: Validation Gates

### VAL-VG-200: Validation gates rule
Validation gates description.
Evidence: unit-test(vg test)

## Area: End-to-End

### VAL-E2E-300: E2E rule
E2E description.
Evidence: integration-test(e2e test)
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'various-areas.md'), variousAreasContract);
}

function cleanupFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
}

describe('validation-contract-parser', () => {
  before(() => {
    createFixtures();
  });

  after(() => {
    cleanupFixtures();
  });

  describe('VAL-VC-001: Parses well-formed contract into executable checks', () => {
    it('parses well-formed contract with 5 rules', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      assert.equal(result.success, true, 'Should succeed on well-formed contract');
      assert.equal(result.rules.length, 5, 'Should extract exactly 5 rules');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.equal(result.warnings.length, 0, 'Should have no warnings');
    });

    it('extracts id, title, description, and evidence from each rule', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      const firstRule = result.rules[0];
      assert.equal(firstRule.id, 'VAL-MC-001', 'Should extract correct ID');
      assert.equal(
        firstRule.title,
        'Fresh workspace provisioning creates required directory tree',
        'Should extract correct title'
      );
      assert.ok(firstRule.description.includes('provisionWorkspace'), 'Should extract description');
      assert.ok(firstRule.evidence.includes('fs.existsSync'), 'Should extract evidence');
    });

    it('extracts all rule IDs from contract', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      const ids = result.rules.map(r => r.id);
      assert.deepEqual(
        ids,
        ['VAL-MC-001', 'VAL-MC-002', 'VAL-MC-003', 'VAL-FS-001', 'VAL-FS-002'],
        'Should extract all IDs in order'
      );
    });

    it('handles empty contract gracefully', () => {
      const contractPath = path.join(FIXTURES_DIR, 'empty.md');
      const result = parseValidationContract(contractPath);

      assert.equal(result.success, true, 'Should succeed on empty contract');
      assert.equal(result.rules.length, 0, 'Should have no rules');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    it('parses multiline descriptions correctly', () => {
      const contractPath = path.join(FIXTURES_DIR, 'multiline.md');
      const result = parseValidationContract(contractPath);

      assert.equal(result.success, true);
      assert.equal(result.rules.length, 2);

      const firstRule = result.rules[0];
      assert.ok(firstRule.description.includes('spans'), 'Should capture multiline content');
      assert.ok(
        firstRule.description.includes('multiple lines'),
        'Should capture multiline content'
      );
    });

    it('parses various area prefixes', () => {
      const contractPath = path.join(FIXTURES_DIR, 'various-areas.md');
      const result = parseValidationContract(contractPath);

      assert.equal(result.success, true);
      assert.equal(result.rules.length, 3);

      const ids = result.rules.map(r => r.id);
      assert.deepEqual(ids, ['VAL-MC-100', 'VAL-VG-200', 'VAL-E2E-300']);
    });
  });

  describe('VAL-VC-002: Duplicate rule IDs rejected', () => {
    it('rejects contract with duplicate IDs', () => {
      const contractPath = path.join(FIXTURES_DIR, 'duplicates.md');
      const result = parseValidationContract(contractPath);

      assert.equal(result.success, false, 'Should fail on duplicate IDs');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    it('includes DUPLICATE_ID error code', () => {
      const contractPath = path.join(FIXTURES_DIR, 'duplicates.md');
      const result = parseValidationContract(contractPath);

      const dupError = result.errors.find(e => e.code === 'DUPLICATE_ID');
      assert.ok(dupError, 'Should have DUPLICATE_ID error code');
    });

    it('lists the duplicate IDs in error details', () => {
      const contractPath = path.join(FIXTURES_DIR, 'duplicates.md');
      const result = parseValidationContract(contractPath);

      const dupError = result.errors.find(e => e.code === 'DUPLICATE_ID');
      assert.ok(
        dupError.details.duplicateIds.includes('VAL-TEST-001'),
        'Should list the duplicate ID'
      );
    });

    it('reports line numbers for duplicates', () => {
      const contractPath = path.join(FIXTURES_DIR, 'duplicates.md');
      const result = parseValidationContract(contractPath);

      const dupError = result.errors.find(e => e.code === 'DUPLICATE_ID');
      assert.ok(dupError.details.lines, 'Should have line information');
    });
  });

  describe('VAL-VC-003: Malformed markdown degrades gracefully', () => {
    it('returns partial result with error list for malformed markdown', () => {
      const contractPath = path.join(FIXTURES_DIR, 'malformed.md');
      const result = parseValidationContract(contractPath);

      // Should succeed with partial results, not crash
      assert.ok(result.rules.length > 0, 'Should extract valid rules');
      assert.ok(result.errors.length > 0, 'Should report errors for broken rules');
    });

    it('extracts valid rules from malformed contract', () => {
      const contractPath = path.join(FIXTURES_DIR, 'malformed.md');
      const result = parseValidationContract(contractPath);

      // Should extract the 2 valid rules
      const validIds = result.rules.map(r => r.id);
      assert.ok(validIds.includes('VAL-BRK-002'), 'Should extract valid rule BRK-002');
      assert.ok(validIds.includes('VAL-BRK-003'), 'Should extract valid rule BRK-003');
    });

    it('reports structured errors with line numbers', () => {
      const contractPath = path.join(FIXTURES_DIR, 'malformed.md');
      const result = parseValidationContract(contractPath);

      const missingEvidenceError = result.errors.find(
        e => e.code === 'MISSING_EVIDENCE' || e.code === 'MALFORMED_RULE'
      );
      assert.ok(missingEvidenceError, 'Should report error for rule without Evidence');
      assert.ok(typeof missingEvidenceError.line === 'number', 'Error should include line number');
    });

    it('does not crash on completely invalid content', () => {
      // Create a completely invalid file
      const invalidPath = path.join(FIXTURES_DIR, 'completely-invalid.md');
      fs.writeFileSync(invalidPath, 'This is not markdown at all\njust random text\nno structure');

      const result = parseValidationContract(invalidPath);
      assert.ok(result, 'Should return result object');
      assert.ok(Array.isArray(result.rules), 'Should have rules array');
      assert.ok(Array.isArray(result.errors), 'Should have errors array');
      assert.equal(result.success, true, 'Should succeed with empty results');

      // Clean up
      fs.unlinkSync(invalidPath);
    });

    it('handles missing file gracefully', () => {
      const nonexistentPath = path.join(FIXTURES_DIR, 'nonexistent.md');
      const result = parseValidationContract(nonexistentPath);

      assert.equal(result.success, false, 'Should fail on missing file');
      assert.ok(result.errors.length > 0, 'Should have errors');
      assert.equal(result.errors[0].code, 'FILE_NOT_FOUND', 'Should have FILE_NOT_FOUND error');
    });
  });

  describe('Rule object structure', () => {
    it('each rule has required fields', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      for (const rule of result.rules) {
        assert.ok(rule.id, 'Rule should have id');
        assert.ok(rule.title, 'Rule should have title');
        assert.ok(rule.description, 'Rule should have description');
        assert.ok(rule.evidence, 'Rule should have evidence');
        assert.ok(typeof rule.line === 'number', 'Rule should have line number');
      }
    });

    it('description is trimmed of leading/trailing whitespace', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      for (const rule of result.rules) {
        assert.equal(rule.description, rule.description.trim(), 'Description should be trimmed');
      }
    });

    it('evidence is trimmed of leading/trailing whitespace', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      for (const rule of result.rules) {
        assert.equal(rule.evidence, rule.evidence.trim(), 'Evidence should be trimmed');
      }
    });
  });

  describe('Result object structure', () => {
    it('returns {success, rules, errors, warnings} structure', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      assert.ok('success' in result, 'Should have success field');
      assert.ok('rules' in result, 'Should have rules field');
      assert.ok('errors' in result, 'Should have errors field');
      assert.ok('warnings' in result, 'Should have warnings field');
    });

    it('rules and errors are always arrays', () => {
      const contractPath = path.join(FIXTURES_DIR, 'well-formed.md');
      const result = parseValidationContract(contractPath);

      assert.ok(Array.isArray(result.rules), 'rules should be array');
      assert.ok(Array.isArray(result.errors), 'errors should be array');
      assert.ok(Array.isArray(result.warnings), 'warnings should be array');
    });
  });
});
