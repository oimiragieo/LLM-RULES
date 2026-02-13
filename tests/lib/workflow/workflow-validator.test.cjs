#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'workflow-validator-tests');

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function writeYaml(fileName, content) {
  ensureTmpDir();
  const filePath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('workflow-validator', () => {
  it('exports WorkflowValidator class', () => {
    assert.equal(typeof WorkflowValidator, 'function');
  });

  it('validates a minimal array-based workflow', async () => {
    const validator = new WorkflowValidator();
    const workflow = {
      name: 'valid-workflow',
      phases: [{ name: 'evaluate', tasks: ['Confirm scope'] }],
    };
    const result = await validator.validate(workflow, { returnErrors: true });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('returns error when name is missing', async () => {
    const validator = new WorkflowValidator();
    const workflow = {
      phases: [{ name: 'evaluate', tasks: ['Confirm scope'] }],
    };
    const result = await validator.validate(workflow, { returnErrors: true });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("missing 'name'")));
  });

  it('returns error when phases are missing', async () => {
    const validator = new WorkflowValidator();
    const workflow = { name: 'no-phases' };
    const result = await validator.validate(workflow, { returnErrors: true });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('phases array')));
  });

  it('loads YAML from file path and validates', async () => {
    const validator = new WorkflowValidator();
    const filePath = writeYaml(
      'valid.yaml',
      [
        'name: file-based-workflow',
        'phases:',
        '  - name: evaluate',
        '    tasks:',
        '      - Confirm scope',
      ].join('\n')
    );
    const result = await validator.validate(filePath, { returnErrors: true });
    assert.equal(result.valid, true);
  });

  it('validateStepSchema catches missing step id and action/handler', () => {
    const validator = new WorkflowValidator();
    const workflow = {
      phases: {
        evaluate: {
          steps: [{ action: 'prompt' }, { id: 'step-2' }],
        },
      },
    };
    const result = validator.validateStepSchema(workflow);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("missing 'id'")));
    assert.ok(result.errors.some(e => e.includes("missing 'handler' or 'action'")));
  });
});
