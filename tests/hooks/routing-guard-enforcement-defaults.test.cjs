#!/usr/bin/env node
/**
 * Test: routing-guard enforcement defaults are "block" mode
 * RED: These tests should FAIL before we change the defaults
 * GREEN: After changing defaults in .env.example and routing-guard.cjs
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

test('Task 1.1: .env.example enforcement defaults are "block"', async () => {
  const envExamplePath = path.join(PROJECT_ROOT, '.env.example');
  const content = fs.readFileSync(envExamplePath, 'utf8');

  // Check PLANNER_FIRST_ENFORCEMENT
  const plannerLine = content
    .split('\n')
    .find(line => line.trim().startsWith('PLANNER_FIRST_ENFORCEMENT='));

  assert.ok(
    plannerLine && plannerLine.includes('block'),
    'Expected PLANNER_FIRST_ENFORCEMENT=block in .env.example'
  );

  // Check SECURITY_REVIEW_ENFORCEMENT
  const securityLine = content
    .split('\n')
    .find(line => line.trim().startsWith('SECURITY_REVIEW_ENFORCEMENT='));

  assert.ok(
    securityLine && securityLine.includes('block'),
    'Expected SECURITY_REVIEW_ENFORCEMENT=block in .env.example'
  );

  // Check SPAWN_PROMPT_VALIDATOR
  const validatorLine = content
    .split('\n')
    .find(line => line.trim().startsWith('SPAWN_PROMPT_VALIDATOR='));

  assert.ok(
    validatorLine && validatorLine.includes('block'),
    'Expected SPAWN_PROMPT_VALIDATOR=block in .env.example'
  );
});

test('Task 1.1: routing-guard.cjs internal defaults are "block"', async () => {
  const guardPath = path.join(PROJECT_ROOT, '.claude/hooks/routing/routing-guard.cjs');
  const content = fs.readFileSync(guardPath, 'utf8');

  // Find getEnforcementMode calls with second param (the default)
  // Looking for getEnforcementMode('...', 'block') instead of 'warn'

  const plannerEnforcementPattern = /getEnforcementMode\('PLANNER_FIRST_ENFORCEMENT',\s*'(\w+)'\)/;
  const securityEnforcementPattern =
    /getEnforcementMode\('SECURITY_REVIEW_ENFORCEMENT',\s*'(\w+)'\)/;

  const plannerMatch = content.match(plannerEnforcementPattern);
  const securityMatch = content.match(securityEnforcementPattern);

  assert.ok(plannerMatch, 'Should find PLANNER_FIRST_ENFORCEMENT getEnforcementMode call');
  assert.strictEqual(
    plannerMatch[1],
    'block',
    'PLANNER_FIRST_ENFORCEMENT default should be "block"'
  );

  assert.ok(securityMatch, 'Should find SECURITY_REVIEW_ENFORCEMENT getEnforcementMode call');
  assert.strictEqual(
    securityMatch[1],
    'block',
    'SECURITY_REVIEW_ENFORCEMENT default should be "block"'
  );
});
