#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const skillUpdaterDoc = fs.readFileSync('.claude/skills/skill-updater/SKILL.md', 'utf8');
const recommendDoc = fs.readFileSync('.claude/skills/recommend-evolution/SKILL.md', 'utf8');
const summaryWorkflow = fs.readFileSync('.claude/workflows/skill-updater-skill-workflow.md', 'utf8');
const skillCreatorDoc = fs.readFileSync('.claude/skills/skill-creator/SKILL.md', 'utf8');

test('skill-updater documents workflow contract and risk/checklist sections', () => {
  assert.match(skillUpdaterDoc, /Canonical workflow source/i);
  assert.match(skillUpdaterDoc, /Risk Scoring Model/i);
  assert.match(skillUpdaterDoc, /Enterprise Acceptance Checklist/i);
  assert.match(skillUpdaterDoc, /validate-skill-ecosystem\.cjs/i);
  assert.match(skillUpdaterDoc, /stale_skill/i);
});

test('memory protocol docs are cross-platform and avoid shell-specific cat/get-content', () => {
  assert.doesNotMatch(skillUpdaterDoc, /cat \.claude\/context\/memory\/learnings\.md/i);
  assert.doesNotMatch(recommendDoc, /Get-Content .*learnings\.md/i);
});

test('summary workflow points to yaml source of truth', () => {
  assert.match(summaryWorkflow, /Source of truth/i);
  assert.match(summaryWorkflow, /updaters\/skill-updater-workflow\.yaml/i);
});

test('skill-creator includes router gap detection guidance', () => {
  assert.match(skillCreatorDoc, /Router Gap Detection/i);
  assert.match(skillCreatorDoc, /no matching agent\/skill/i);
});
