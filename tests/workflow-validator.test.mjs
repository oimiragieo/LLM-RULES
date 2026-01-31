import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WorkflowValidator } from '../.claude/lib/workflow/workflow-validator.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validator = new WorkflowValidator();

test('workflow-validator - step schema validation', async t => {
  await t.test('validateStep: detects missing step id', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              // Missing 'id' - should fail
              handler: 'some-handler',
              action: 'test-action',
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length > 0, true);
    assert.match(result.errors[0], /missing 'id'/i);
  });

  await t.test('validateStep: detects missing handler and action', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              id: 'step-1',
              // Missing both 'handler' and 'action' - should fail
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length > 0, true);
    assert.match(result.errors[0], /missing 'handler' or 'action'/i);
  });

  await t.test('validateStep: allows step with id and handler', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              id: 'step-1',
              handler: 'some-handler',
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await t.test('validateStep: allows step with id and action', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              id: 'step-1',
              action: 'some-action',
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await t.test('validateStep: validates multiple steps in multiple phases', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              id: 'eval-1',
              handler: 'evaluate-handler',
            },
            {
              // Missing id in second step
              handler: 'eval-2',
            },
          ],
        },
        validate: {
          steps: [
            {
              id: 'validate-1',
              action: 'validate-action',
            },
            {
              id: 'validate-2',
              // Missing both handler and action
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length >= 2, true);
  });

  await t.test('validateStep: reports phase and step index in errors', () => {
    const workflow = {
      name: 'test-workflow',
      phases: {
        evaluate: {
          steps: [
            {
              id: 'step-1',
              handler: 'handler-1',
            },
            {
              // Error in step 2 (index 1)
              id: 'step-2',
              // Missing handler and action
            },
          ],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert.strictEqual(result.valid, false);
    // Match "Phase 'evaluate', Step 2" (with quotes around phase name)
    assert.match(result.errors[0], /Phase ['"]?evaluate['"]?, Step 2/i);
  });

  await t.test('integration: validate() includes step schema validation', async () => {
    // Create a temporary workflow file with invalid steps
    const tmpDir = path.join(__dirname, '../tmp-test-workflows');
    const fs = await import('fs');
    const fsPromises = fs.promises;

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const workflowPath = path.join(tmpDir, 'invalid-steps.yaml');
    const invalidWorkflowContent = `
name: test-workflow
phases:
  evaluate:
    steps:
      - id: eval-1
        handler: evaluate-handler
      - handler: eval-2
        # Missing id - should fail
  validate:
    steps:
      - id: validate-1
        # Missing handler and action - should fail
`;

    try {
      fs.writeFileSync(workflowPath, invalidWorkflowContent);
      const result = await validator.validate(workflowPath, { returnErrors: true });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length > 0, true);
      assert.match(result.errors.join('\n'), /step/i);
    } finally {
      // Cleanup
      if (fs.existsSync(workflowPath)) {
        fs.unlinkSync(workflowPath);
      }
      if (fs.existsSync(tmpDir)) {
        fs.rmdirSync(tmpDir);
      }
    }
  });
});
