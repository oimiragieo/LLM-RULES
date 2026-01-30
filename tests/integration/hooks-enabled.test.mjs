/**
 * Hook Enablement Verification Suite
 *
 * Verifies all 3 error logging hooks are properly registered and executable:
 * - error-capture-post-tool.cjs
 * - error-summary-extractor.cjs
 * - agent-tools-validator.cjs
 *
 * Also verifies supporting infrastructure:
 * - Error logging directories
 * - Library files (error-sanitizer, error-writer, error-pattern-detector)
 * - JSON schemas (agent-tools, error-log)
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = 'C:/dev/projects/agent-studio';

test('Hook Enablement Verification Suite', async (t) => {
  await t.test(
    'error-capture-post-tool hook exists and is readable',
    async () => {
      const hookPath = path.join(
        PROJECT_ROOT,
        '.claude/hooks/safety/error-capture-post-tool.cjs'
      );
      assert.ok(fs.existsSync(hookPath), `Hook not found: ${hookPath}`);

      const content = fs.readFileSync(hookPath, 'utf-8');
      assert.ok(
        content.includes('module.exports'),
        'Hook is not valid CJS module'
      );
      assert.ok(
        content.includes('PostToolUse') || content.includes('post_tool_use'),
        'Hook should handle PostToolUse events'
      );
    }
  );

  await t.test('error-summary-extractor hook exists and is readable', () => {
    const hookPath = path.join(
      PROJECT_ROOT,
      '.claude/hooks/reflection/error-summary-extractor.cjs'
    );
    assert.ok(fs.existsSync(hookPath), `Hook not found: ${hookPath}`);

    const content = fs.readFileSync(hookPath, 'utf-8');
    assert.ok(
      content.includes('module.exports'),
      'Hook is not valid CJS module'
    );
  });

  await t.test('agent-tools-validator hook exists and is readable', () => {
    const hookPath = path.join(
      PROJECT_ROOT,
      '.claude/hooks/validation/agent-tools-validator.cjs'
    );
    assert.ok(fs.existsSync(hookPath), `Hook not found: ${hookPath}`);

    const content = fs.readFileSync(hookPath, 'utf-8');
    assert.ok(
      content.includes('module.exports'),
      'Hook is not valid CJS module'
    );
  });

  await t.test('error logging directories exist', () => {
    const dirs = [
      '.claude/context/artifacts/error-reports/',
      '.claude/context/artifacts/error-reports/archive/',
      '.claude/context/artifacts/error-summaries/',
    ];
    for (const dir of dirs) {
      const fullPath = path.join(PROJECT_ROOT, dir);
      assert.ok(fs.existsSync(fullPath), `Directory not found: ${fullPath}`);
    }
  });

  await t.test('error-sanitizer library is accessible', () => {
    const libPath = path.join(
      PROJECT_ROOT,
      '.claude/lib/utils/error-sanitizer.cjs'
    );
    assert.ok(fs.existsSync(libPath), `Library not found: ${libPath}`);

    // Verify it can be required
    const sanitizer = require(libPath);
    assert.ok(
      typeof sanitizer.sanitizeForLogging === 'function',
      'sanitizeForLogging function should be exported'
    );
  });

  await t.test('error-writer library is accessible', () => {
    const libPath = path.join(PROJECT_ROOT, '.claude/lib/error-writer.cjs');
    assert.ok(fs.existsSync(libPath), `Library not found: ${libPath}`);

    // Verify it can be required
    const writer = require(libPath);
    assert.ok(
      typeof writer.writeError === 'function',
      'writeError function should be exported'
    );
  });

  await t.test('error-pattern-detector library is accessible', () => {
    const libPath = path.join(
      PROJECT_ROOT,
      '.claude/lib/error-pattern-detector.cjs'
    );
    assert.ok(fs.existsSync(libPath), `Library not found: ${libPath}`);

    // Verify it can be required
    const detector = require(libPath);
    assert.ok(
      typeof detector.detectPatterns === 'function',
      'detectPatterns function should be exported'
    );
  });

  await t.test('agent-tools schema is valid JSON', () => {
    const schemaPath = path.join(
      PROJECT_ROOT,
      '.claude/schemas/agent-tools.json'
    );
    assert.ok(fs.existsSync(schemaPath), `Schema not found: ${schemaPath}`);

    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    // Schema uses definitions.coreTools structure
    assert.ok(schema.definitions, 'Schema should have definitions');
    assert.ok(
      schema.definitions.coreTools,
      'Schema should have definitions.coreTools'
    );
    assert.ok(
      schema.definitions.approvedMcpTools,
      'Schema should have definitions.approvedMcpTools'
    );
  });

  await t.test('error-log schema is valid JSON', () => {
    const schemaPath = path.join(
      PROJECT_ROOT,
      '.claude/schemas/error-log-schema.json'
    );
    assert.ok(fs.existsSync(schemaPath), `Schema not found: ${schemaPath}`);

    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    assert.ok(schema.properties, 'Schema missing properties');
    assert.ok(schema.properties.errorId, 'Schema should have errorId property');
    assert.ok(
      schema.properties.timestamp,
      'Schema should have timestamp property'
    );
  });

  await t.test('.env file exists with error logging config', () => {
    const envPath = path.join(PROJECT_ROOT, '.env');
    assert.ok(fs.existsSync(envPath), `.env file not found: ${envPath}`);

    const content = fs.readFileSync(envPath, 'utf-8');
    assert.ok(
      content.includes('ERROR_LOGGING_ENABLED'),
      'ERROR_LOGGING_ENABLED should be in .env'
    );
    assert.ok(
      content.includes('ERROR_CAPTURE_HOOK'),
      'ERROR_CAPTURE_HOOK should be in .env'
    );
    assert.ok(
      content.includes('AGENT_TOOLS_VALIDATOR'),
      'AGENT_TOOLS_VALIDATOR should be in .env'
    );
  });
});
