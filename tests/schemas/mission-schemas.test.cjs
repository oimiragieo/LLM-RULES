'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMAS_DIR = path.join(__dirname, '..', '..', '.claude', 'schemas');

const MISSION_SCHEMAS = [
  'mission-feature.schema.json',
  'mission-features-document.schema.json',
  'mission-handoff-document.schema.json',
  'mission-state.schema.json',
  'mission-validation-state.schema.json',
  'mission-grading-report.schema.json',
];

describe('Mission Schemas — existence and structure', () => {
  for (const schemaFile of MISSION_SCHEMAS) {
    it(`${schemaFile} exists and is valid JSON`, () => {
      const filePath = path.join(SCHEMAS_DIR, schemaFile);
      assert.ok(fs.existsSync(filePath), `${schemaFile} should exist`);
      const content = fs.readFileSync(filePath, 'utf8');
      const schema = JSON.parse(content);
      assert.ok(schema.$schema, 'should have $schema');
      assert.ok(schema.$id, 'should have $id');
      assert.equal(schema.type, 'object', 'should be object type');
    });
  }
});

describe('mission-feature.schema.json — required fields', () => {
  it('requires the correct fields', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-feature.schema.json'), 'utf8')
    );
    const expected = [
      'id',
      'description',
      'skillName',
      'preconditions',
      'expectedBehavior',
      'verificationSteps',
      'milestone',
      'status',
    ];
    assert.deepEqual(schema.required.sort(), expected.sort());
  });

  it('id has kebab-case pattern', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-feature.schema.json'), 'utf8')
    );
    assert.ok(schema.properties.id.pattern);
    const re = new RegExp(schema.properties.id.pattern);
    assert.ok(re.test('fts5-search'));
    assert.ok(re.test('auto-extract-pipeline'));
    assert.ok(!re.test('UPPER_CASE'));
    assert.ok(!re.test('-starts-with-dash'));
  });

  it('fulfills items match VAL-* pattern', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-feature.schema.json'), 'utf8')
    );
    const pattern = schema.properties.fulfills.items.pattern;
    const re = new RegExp(pattern);
    assert.ok(re.test('VAL-MEM-001'));
    assert.ok(re.test('VAL-RALPH-023'));
    assert.ok(!re.test('VAL-mem-001'));
    assert.ok(!re.test('VAL-MEM-1'));
    assert.ok(!re.test('NOT-A-VAL'));
  });

  it('status has correct enum values', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-feature.schema.json'), 'utf8')
    );
    const expected = ['pending', 'in_progress', 'validating', 'completed', 'failed', 'cancelled'];
    assert.deepEqual(schema.properties.status.enum, expected);
  });
});

describe('mission-handoff-document.schema.json — structure', () => {
  it('requires handoff object with verification, tests, discoveredIssues, skillFeedback', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-handoff-document.schema.json'), 'utf8')
    );
    assert.ok(schema.properties.handoff, 'should have handoff property');
    const handoffRequired = schema.properties.handoff.required;
    assert.ok(handoffRequired.includes('verification'));
    assert.ok(handoffRequired.includes('tests'));
    assert.ok(handoffRequired.includes('discoveredIssues'));
    assert.ok(handoffRequired.includes('skillFeedback'));
  });

  it('successState has correct enum', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-handoff-document.schema.json'), 'utf8')
    );
    assert.deepEqual(schema.properties.successState.enum, ['success', 'failure', 'partial']);
  });

  it('commitId matches git SHA pattern', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-handoff-document.schema.json'), 'utf8')
    );
    const re = new RegExp(schema.properties.commitId.pattern);
    assert.ok(re.test('abc1234'));
    assert.ok(re.test('2accf1a5649e2849863818bc4908878212a42ab3'));
    assert.ok(!re.test('abc'));
    assert.ok(!re.test('GHIJKL1'));
  });
});

describe('mission-state.schema.json — structure', () => {
  it('state enum includes pending (Agent Studio addition)', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-state.schema.json'), 'utf8')
    );
    assert.ok(schema.properties.state.enum.includes('pending'));
    assert.ok(schema.properties.state.enum.includes('running'));
    assert.ok(schema.properties.state.enum.includes('paused'));
    assert.ok(schema.properties.state.enum.includes('completed'));
  });
});

describe('mission-validation-state.schema.json — structure', () => {
  it('assertions additionalProperties has status enum', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-validation-state.schema.json'), 'utf8')
    );
    const assertionSchema = schema.properties.assertions.additionalProperties;
    assert.ok(assertionSchema.properties.status.enum.includes('pending'));
    assert.ok(assertionSchema.properties.status.enum.includes('passed'));
    assert.ok(assertionSchema.properties.status.enum.includes('failed'));
    assert.ok(assertionSchema.properties.status.enum.includes('skipped'));
  });
});

describe('mission-grading-report.schema.json — structure', () => {
  it('summary requires score, maxScore, passed', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-grading-report.schema.json'), 'utf8')
    );
    const summaryRequired = schema.properties.summary.required;
    assert.ok(summaryRequired.includes('score'));
    assert.ok(summaryRequired.includes('maxScore'));
    assert.ok(summaryRequired.includes('passed'));
  });

  it('results items require ruleId, outcome, weight', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-grading-report.schema.json'), 'utf8')
    );
    const itemRequired = schema.properties.results.items.required;
    assert.ok(itemRequired.includes('ruleId'));
    assert.ok(itemRequired.includes('outcome'));
    assert.ok(itemRequired.includes('weight'));
  });

  it('outcome enum includes pass, fail, na, unknown', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'mission-grading-report.schema.json'), 'utf8')
    );
    const outcomeEnum = schema.properties.results.items.properties.outcome.enum;
    assert.deepEqual(outcomeEnum, ['pass', 'fail', 'na', 'unknown']);
  });
});
