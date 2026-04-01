#!/usr/bin/env node
'use strict';

// Tests for context threshold alignment (VAL-CM-003, VAL-CM-008)
// Verifies:
//   1. SKILL.md has Post-Compact Recovery section with >=3 actionable steps
//   2. context-window-monitor thresholds are consistent with SKILL.md zones
//   3. Critical zone boundary is <= 93%

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const SKILL_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'context-degradation',
  'SKILL.md'
);

const MONITOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'context-window-monitor.cjs'
);

// ─── Test 1: Post-Compact Recovery section exists with >=3 actionable steps ──

// VAL-CM-008
test('SKILL.md has a Post-Compact Recovery section', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.ok(
    content.includes('Post-Compact Recovery'),
    'SKILL.md must contain a "Post-Compact Recovery" section heading'
  );
});

test('Post-Compact Recovery section has >= 3 numbered actionable steps', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');

  // Find the Post-Compact Recovery section
  const sectionStart = content.indexOf('## Post-Compact Recovery');
  assert.ok(sectionStart !== -1, 'Post-Compact Recovery section must exist');

  // Extract content from that section to the next ## heading (or EOF)
  const afterSection = content.slice(sectionStart);
  const nextHeadingMatch = afterSection.slice(1).search(/^## /m);
  const sectionContent =
    nextHeadingMatch === -1
      ? afterSection
      : afterSection.slice(0, nextHeadingMatch + 1);

  // Count numbered list items (lines starting with a digit followed by '. ')
  const numberedItems = sectionContent.match(/^\d+\.\s+\*\*\S/gm);
  const itemCount = numberedItems ? numberedItems.length : 0;

  assert.ok(
    itemCount >= 3,
    `Post-Compact Recovery section must have >= 3 numbered actionable steps, found ${itemCount}`
  );
});

// ─── Test 2: Monitor WARN_THRESHOLD_PCT aligns with Yellow zone (65%) ────────

// VAL-CM-003
test('context-window-monitor WARN_THRESHOLD_PCT aligns with SKILL.md Yellow zone (65%)', () => {
  // Read the monitor source
  const monitorSrc = fs.readFileSync(MONITOR_PATH, 'utf8');

  // Extract WARN_THRESHOLD_PCT value
  const warnMatch = monitorSrc.match(/const\s+WARN_THRESHOLD_PCT\s*=\s*([\d.]+)/);
  assert.ok(warnMatch, 'WARN_THRESHOLD_PCT must be defined in context-window-monitor.cjs');

  const warnPct = parseFloat(warnMatch[1]);

  // SKILL.md Yellow zone starts at 65% — warn threshold must equal 0.65
  assert.strictEqual(
    warnPct,
    0.65,
    `WARN_THRESHOLD_PCT must be 0.65 (65%, Yellow zone start), got ${warnPct}`
  );
});

test('context-window-monitor CRITICAL_THRESHOLD_PCT aligns with SKILL.md Critical zone (90%)', () => {
  const monitorSrc = fs.readFileSync(MONITOR_PATH, 'utf8');

  // Extract CRITICAL_THRESHOLD_PCT value
  const critMatch = monitorSrc.match(/const\s+CRITICAL_THRESHOLD_PCT\s*=\s*([\d.]+)/);
  assert.ok(critMatch, 'CRITICAL_THRESHOLD_PCT must be defined in context-window-monitor.cjs');

  const critPct = parseFloat(critMatch[1]);

  // SKILL.md Critical zone starts at 90% — critical threshold must equal 0.9
  assert.strictEqual(
    critPct,
    0.9,
    `CRITICAL_THRESHOLD_PCT must be 0.9 (90%, Critical zone start), got ${critPct}`
  );
});

// ─── Test 3: Critical zone boundary <= 93% ───────────────────────────────────

// VAL-CM-003: Critical zone <= 187K (93.5% of 200K) per CC auto-compact constant
test('SKILL.md Critical zone boundary is <= 93%', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');

  // Find the Critical zone row in the Severity Zones table
  // The table row for Critical should show 90–93% or similar
  // We verify the upper boundary is <= 93%
  const criticalRowMatch = content.match(/Critical\s*\|\s*([\d]+)–([\d]+)%/);
  assert.ok(
    criticalRowMatch,
    'SKILL.md Severity Zones table must have a Critical row with a percentage range (e.g. 90–93%)'
  );

  const upperBoundary = parseInt(criticalRowMatch[2], 10);
  assert.ok(
    upperBoundary <= 93,
    `Critical zone upper boundary must be <= 93% (auto-compact fires at ~93.5%), got ${upperBoundary}%`
  );
});

test('SKILL.md monitor CRITICAL_THRESHOLD_PCT is less than auto-compact boundary (93%)', () => {
  const monitorSrc = fs.readFileSync(MONITOR_PATH, 'utf8');

  const critMatch = monitorSrc.match(/const\s+CRITICAL_THRESHOLD_PCT\s*=\s*([\d.]+)/);
  assert.ok(critMatch, 'CRITICAL_THRESHOLD_PCT must be defined');

  const critPct = parseFloat(critMatch[1]);

  // Critical threshold must be < 93% so monitor fires before CC auto-compact
  assert.ok(
    critPct < 0.93,
    `CRITICAL_THRESHOLD_PCT (${critPct}) must be < 0.93 to fire before CC auto-compact (~93.5%)`
  );
});

// ─── Test 4: Severity Zones table contains all expected zones ─────────────────

test('SKILL.md Severity Zones table contains Green, Yellow, Orange/Red, Critical, Auto-compact zones', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');

  assert.ok(content.includes('Green'), 'SKILL.md must contain Green zone');
  assert.ok(content.includes('Yellow'), 'SKILL.md must contain Yellow zone');
  assert.ok(
    content.includes('Orange') || content.includes('Orange/Red'),
    'SKILL.md must contain Orange/Red zone'
  );
  assert.ok(content.includes('Critical'), 'SKILL.md must contain Critical zone');
  assert.ok(content.includes('Auto-compact'), 'SKILL.md must contain Auto-compact zone');
});

// ─── Test 5: SKILL.md references CC auto-compact constant ────────────────────

test('SKILL.md references Claude Code auto-compact buffer constant (13K tokens)', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');

  assert.ok(
    content.includes('13,000') || content.includes('13K'),
    'SKILL.md must reference the CC AUTOCOMPACT_BUFFER_TOKENS constant (13K)'
  );
});

test('SKILL.md references 93% or 93.5% as the auto-compact trigger', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');

  assert.ok(
    content.includes('93.5%') || content.includes('93%'),
    'SKILL.md must reference the ~93% auto-compact trigger point'
  );
});
