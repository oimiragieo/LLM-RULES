'use strict';

/**
 * Tests for F-005: STATE.md Session Continuity Digest
 * Verifies template and initial STATE.md exist with required structure.
 *
 * TDD RED phase: These tests must fail before files are created.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TEMPLATE_FILE = path.join(PROJECT_ROOT, '.claude', 'templates', 'state-digest.md');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'STATE.md');

const REQUIRED_SECTIONS = ['Position', 'Velocity', 'Decisions', 'Blockers', 'Continuity'];

describe('F-005: STATE.md Session Continuity Digest — Template', () => {
  test('template file exists at .claude/templates/state-digest.md', () => {
    assert.ok(
      fs.existsSync(TEMPLATE_FILE),
      `Expected state-digest.md to exist at ${TEMPLATE_FILE}`
    );
  });

  test('template contains all 5 required sections', () => {
    const content = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    for (const section of REQUIRED_SECTIONS) {
      assert.match(
        content,
        new RegExp(section, 'i'),
        `Expected template to contain section: ${section}`
      );
    }
  });

  test('template is under 100 lines', () => {
    const content = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 100, `Expected template to be under 100 lines, got ${lines}`);
  });

  test('template has valid markdown structure (has a heading)', () => {
    const content = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    assert.match(content, /^#\s+/m, 'Expected at least one markdown heading');
  });

  test('template is self-documenting (has usage instructions)', () => {
    const content = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    assert.match(
      content,
      /how to use|update|usage|instructions|when to/i,
      'Expected template to include usage instructions'
    );
  });
});

describe('F-005: STATE.md Session Continuity Digest — Initial File', () => {
  test('initial STATE.md exists at .claude/context/memory/STATE.md', () => {
    assert.ok(
      fs.existsSync(STATE_FILE),
      `Expected STATE.md to exist at ${STATE_FILE}`
    );
  });

  test('STATE.md contains all 5 required sections', () => {
    const content = fs.readFileSync(STATE_FILE, 'utf8');

    for (const section of REQUIRED_SECTIONS) {
      assert.match(
        content,
        new RegExp(section, 'i'),
        `Expected STATE.md to contain section: ${section}`
      );
    }
  });

  test('STATE.md is under 100 lines', () => {
    const content = fs.readFileSync(STATE_FILE, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 100, `Expected STATE.md to be under 100 lines, got ${lines}`);
  });

  test('STATE.md has a last-updated timestamp field', () => {
    const content = fs.readFileSync(STATE_FILE, 'utf8');
    assert.match(
      content,
      /last.updated|updated.at|timestamp/i,
      'Expected STATE.md to have a last-updated field'
    );
  });
});
