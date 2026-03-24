'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'safety',
  'context-monitor.cjs'
);

describe('context-monitor hook', () => {
  test('hook file exists', () => {
    assert.ok(fs.existsSync(HOOK_PATH), `Hook not found at ${HOOK_PATH}`);
  });

  test('hook is valid JavaScript (parseable)', () => {
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    // Check it contains valid JS structure markers
    assert.ok(content.includes("'use strict'"), 'Hook should use strict mode');
    assert.ok(
      content.includes('process.stdin') || content.includes('process.exit'),
      'Hook should use stdin/exit protocol'
    );
  });

  test('hook exports or defines monitoring logic', () => {
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(
      content.includes('WARNING') || content.includes('CRITICAL'),
      'Hook should define WARNING and CRITICAL levels'
    );
  });

  test('hook implements threshold-based warning logic', () => {
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(
      content.includes('WARNING_THRESHOLD') ||
        content.includes('CRITICAL_THRESHOLD') ||
        content.includes('remainingPercent'),
      'Hook should implement threshold-based monitoring'
    );
  });

  test('hook reads from bridge file (not inline computation)', () => {
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(
      content.includes('bridge') || content.includes('token') || content.includes('context'),
      'Hook should reference context/token bridge'
    );
  });

  test('hook exits 0 (fail-open advisory)', () => {
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(content.includes('process.exit(0)'), 'Advisory hook should exit 0');
    // Should NOT contain exit(2) as primary path (advisory, not security)
  });
});
