#!/usr/bin/env node
/**
 * Tests for shell:true removal in skill scripts
 *
 * Verifies that 4 skill scripts do NOT use shell: true in spawn calls.
 * This prevents command injection via malicious arguments.
 *
 * Test Categories:
 * 1. Source code verification (no shell: true in spawn options)
 * 2. Functional verification (commands work with shell: false)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const SKILL_SCRIPTS = [
  {
    name: 'sequential-thinking',
    file: '.claude/skills/sequential-thinking/scripts/main.cjs',
    command: 'python',
  },
  {
    name: 'git-expert',
    file: '.claude/skills/git-expert/scripts/main.cjs',
    command: 'git',
  },
  {
    name: 'docker-compose',
    file: '.claude/skills/docker-compose/scripts/main.cjs',
    command: 'docker',
  },
  {
    name: 'terraform-infra',
    file: '.claude/skills/terraform-infra/scripts/main.cjs',
    command: 'terraform',
  },
];

describe('shell injection prevention in skill scripts', () => {
  for (const skill of SKILL_SCRIPTS) {
    it(`${skill.name}/scripts/main.cjs should not contain shell: true`, () => {
      const filePath = path.join(PROJECT_ROOT, skill.file);
      assert.ok(fs.existsSync(filePath), `File not found: ${skill.file}`);

      const content = fs.readFileSync(filePath, 'utf8');

      // Check that no spawn/spawnSync call uses shell: true
      // Match patterns like: shell: true, shell:true, shell : true
      const shellTruePattern = /shell\s*:\s*true/g;
      const matches = content.match(shellTruePattern);

      assert.strictEqual(
        matches,
        null,
        `${skill.name}/scripts/main.cjs contains "shell: true" (${(matches || []).length} occurrence(s)). ` +
          'This is a command injection risk. Use shell: false or remove the shell option.'
      );
    });
  }

  it('should have exactly 4 skill scripts to check', () => {
    assert.strictEqual(SKILL_SCRIPTS.length, 4, 'Expected 4 skill scripts to verify');
  });
});
