// <!-- Agent: developer | Task: f4-routing-guard-check7-impl-2026-04-17 | Session: 2026-04-17 -->
// Tests for F4 Check 7 second-pass DOMAIN_SPECIALIST_PATTERNS routing guard.
// 5 sentinel cases per architect approval memo f4-routing-guard-domain-check-2026-04-17.md
'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const { checkSpecialistOverride, invalidateCachedState } = require(
  path.join(PROJECT_ROOT, '.claude/hooks/routing/routing-guard.cjs')
);

describe('F4 routing-guard domain-resolution sentinel tests', { concurrency: 1 }, () => {
  beforeEach(() => {
    invalidateCachedState();
  });

  // Case 1: warn fires — developer spawn with Next.js domain signal
  // DOMAIN_SPECIALIST_ENFORCEMENT=warn (default) → pass=true, result='warn', message mentions nextjs-pro
  test('warn fires for Next.js developer spawn (default warn mode)', () => {
    const result = checkSpecialistOverride(
      'Task',
      {
        subagent_type: 'developer',
        prompt: 'build a Next.js app router page with server components',
        description: 'implement the feature',
      },
      null
      // env override: DOMAIN_SPECIALIST_ENFORCEMENT not set → defaults to warn
    );
    assert.equal(result.pass, true, 'warn mode must pass=true');
    assert.equal(result.result, 'warn', 'must produce result=warn');
    assert.ok(result.message, 'must have a message');
    assert.ok(
      result.message.includes('nextjs-pro'),
      `message must mention nextjs-pro, got: ${result.message}`
    );
  });

  // Case 2: warn SUPPRESSED by negation guard
  // "do NOT use rust" → hasNegationNearSignal returns true → no warn
  test('warn suppressed when negation token precedes domain signal', () => {
    const result = checkSpecialistOverride('Task', {
      subagent_type: 'developer',
      prompt: 'do NOT use rust in this module, implement in Go instead',
      description: '',
    });
    assert.equal(result.pass, true, 'must pass=true');
    assert.equal(
      result.result,
      undefined,
      `must produce no warn for negated signal, got result=${result.result}`
    );
    assert.equal(result.message, undefined, 'must produce no message for negated signal');
  });

  // Case 3: no-match — generic documentation task without domain signal
  // "add documentation for existing API" → no domain signal → pass silently
  test('no warn for generic documentation task without domain signal', () => {
    const result = checkSpecialistOverride('Task', {
      subagent_type: 'developer',
      prompt: 'add documentation for existing API',
      description: '',
    });
    assert.equal(result.pass, true, 'must pass=true');
    assert.equal(
      result.result,
      undefined,
      `must produce no result for no-match prompt, got: ${result.result}`
    );
    assert.equal(result.message, undefined, 'must produce no message for no-match');
  });

  // Case 4: block mode — domain match with DOMAIN_SPECIALIST_ENFORCEMENT=block
  // Verify pass=false, result='block'
  test('block mode returns pass=false for matching domain signal', () => {
    const origEnv = process.env.DOMAIN_SPECIALIST_ENFORCEMENT;
    process.env.DOMAIN_SPECIALIST_ENFORCEMENT = 'block';
    try {
      invalidateCachedState();
      const result = checkSpecialistOverride('Task', {
        subagent_type: 'developer',
        prompt: 'implement a FastAPI microservice with Pydantic models',
        description: '',
      });
      assert.equal(result.pass, false, 'block mode must pass=false');
      assert.equal(result.result, 'block', 'must produce result=block');
      assert.ok(result.message, 'must have a message');
      assert.ok(
        result.message.includes('fastapi-pro'),
        `message must mention fastapi-pro, got: ${result.message}`
      );
    } finally {
      if (origEnv === undefined) {
        delete process.env.DOMAIN_SPECIALIST_ENFORCEMENT;
      } else {
        process.env.DOMAIN_SPECIALIST_ENFORCEMENT = origEnv;
      }
      invalidateCachedState();
    }
  });

  // Case 5: off mode — domain match but DOMAIN_SPECIALIST_ENFORCEMENT=off → pass silently
  test('off mode suppresses domain specialist check entirely', () => {
    const origEnv = process.env.DOMAIN_SPECIALIST_ENFORCEMENT;
    process.env.DOMAIN_SPECIALIST_ENFORCEMENT = 'off';
    try {
      invalidateCachedState();
      const result = checkSpecialistOverride('Task', {
        subagent_type: 'developer',
        prompt: 'build a Python Django REST API with DRF viewsets',
        description: '',
      });
      assert.equal(result.pass, true, 'off mode must pass=true');
      assert.equal(
        result.result,
        undefined,
        `off mode must produce no result, got: ${result.result}`
      );
      assert.equal(result.message, undefined, 'off mode must produce no message');
    } finally {
      if (origEnv === undefined) {
        delete process.env.DOMAIN_SPECIALIST_ENFORCEMENT;
      } else {
        process.env.DOMAIN_SPECIALIST_ENFORCEMENT = origEnv;
      }
      invalidateCachedState();
    }
  });
});
