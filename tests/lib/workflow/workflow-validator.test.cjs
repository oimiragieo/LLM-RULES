#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

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

function loadWorkflowValidator(mockModules = new Map()) {
  const modulePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'workflow',
    'workflow-validator.cjs'
  );
  const resolvedPath = require.resolve(modulePath);
  const originalLoad = Module._load;
  delete require.cache[resolvedPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (mockModules.has(request)) {
      const replacement = mockModules.get(request);
      if (replacement instanceof Error) {
        throw replacement;
      }
      return replacement;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }
}

describe('workflow-validator', () => {
  it('exports WorkflowValidator class', () => {
    const { WorkflowValidator } = loadWorkflowValidator();
    assert.equal(typeof WorkflowValidator, 'function');
  });

  it('validates a minimal array-based workflow', async () => {
    const { WorkflowValidator } = loadWorkflowValidator();
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
    const { WorkflowValidator } = loadWorkflowValidator();
    const validator = new WorkflowValidator();
    const workflow = {
      phases: [{ name: 'evaluate', tasks: ['Confirm scope'] }],
    };
    const result = await validator.validate(workflow, { returnErrors: true });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("missing 'name'")));
  });

  it('returns error when phases are missing', async () => {
    const { WorkflowValidator } = loadWorkflowValidator();
    const validator = new WorkflowValidator();
    const workflow = { name: 'no-phases' };
    const result = await validator.validate(workflow, { returnErrors: true });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('phases array')));
  });

  it('loads YAML from file path and validates', async () => {
    const { WorkflowValidator } = loadWorkflowValidator();
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

  it('loads YAML from file path even when the yaml package is unavailable', async () => {
    const { WorkflowValidator } = loadWorkflowValidator(
      new Map([['yaml', new Error("Cannot find module 'yaml'")]])
    );
    const validator = new WorkflowValidator();
    const filePath = writeYaml(
      'valid-no-yaml.yaml',
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
    const { WorkflowValidator } = loadWorkflowValidator();
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
