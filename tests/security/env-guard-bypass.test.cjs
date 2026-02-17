const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Test environment variable guard bypass prevention (WS4-002)

test('EnvGuard: when CREATOR_GUARD=off, audit log entry created', () => {
  // Set env var
  const originalValue = process.env.CREATOR_GUARD;
  process.env.CREATOR_GUARD = 'off';

  try {
    // Trigger guard check (this should log to audit trail)
    const { auditGuardOverride } = require('../../.claude/lib/utils/env-guard-audit.cjs');
    const result = auditGuardOverride('CREATOR_GUARD', 'off');

    assert.strictEqual(result.logged, true, 'Should log override to audit trail');
    assert.ok(result.auditPath, 'Should return audit log path');
    assert.ok(fs.existsSync(result.auditPath), 'Audit log file should exist');

    // Read audit log
    const auditContent = fs.readFileSync(result.auditPath, 'utf8');
    assert.ok(auditContent.includes('CREATOR_GUARD'), 'Audit log should mention CREATOR_GUARD');
    assert.ok(auditContent.includes('off'), 'Audit log should show value=off');
  } finally {
    // Restore original value
    if (originalValue === undefined) {
      delete process.env.CREATOR_GUARD;
    } else {
      process.env.CREATOR_GUARD = originalValue;
    }
  }
});

test('EnvGuard: in CI mode (CI=true), dangerous overrides blocked', () => {
  const originalCI = process.env.CI;
  const originalGuard = process.env.ROUTER_BASH_GUARD;

  process.env.CI = 'true';
  process.env.ROUTER_BASH_GUARD = 'off';

  try {
    const { checkGuardOverrides } = require('../../.claude/lib/utils/env-guard-audit.cjs');
    const result = checkGuardOverrides();

    assert.strictEqual(result.blocked, true, 'Should block dangerous overrides in CI');
    assert.ok(result.violations.length > 0, 'Should have violations');
    assert.ok(result.violations[0].includes('ROUTER_BASH_GUARD'), 'Should detect ROUTER_BASH_GUARD=off');
  } finally {
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }
    if (originalGuard === undefined) {
      delete process.env.ROUTER_BASH_GUARD;
    } else {
      process.env.ROUTER_BASH_GUARD = originalGuard;
    }
  }
});

test('EnvGuard: warning emitted when ENFORCEMENT var set to off', () => {
  const originalValue = process.env.PLANNER_FIRST_ENFORCEMENT;
  process.env.PLANNER_FIRST_ENFORCEMENT = 'off';

  try {
    const { warnOnEnforcementOverride } = require('../../.claude/lib/utils/env-guard-audit.cjs');
    const result = warnOnEnforcementOverride('PLANNER_FIRST_ENFORCEMENT');

    assert.strictEqual(result.warned, true, 'Should emit warning');
    assert.ok(result.message.includes('PLANNER_FIRST_ENFORCEMENT'), 'Warning should mention variable');
    assert.ok(result.message.includes('off'), 'Warning should show value');
  } finally {
    if (originalValue === undefined) {
      delete process.env.PLANNER_FIRST_ENFORCEMENT;
    } else {
      process.env.PLANNER_FIRST_ENFORCEMENT = originalValue;
    }
  }
});
