'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const checks = [
  {
    file: '.claude/workflows/core/router-decision.md',
    forbidden: ['Skill({ skill: "repo-rag" })', 'Skill({ skill: "qa-workflow" })'],
  },
  {
    file: '.claude/workflows/enterprise/feature-development-workflow.md',
    forbidden: ['Skill({ skill: "brainstorming" })', 'brainstorming'],
  },
  {
    file: '.claude/workflows/core/enterprise-workflow.md',
    forbidden: ['Skill({ skill: "qa-workflow" })'],
  },
  {
    file: '.claude/workflows/core/external-integration.md',
    forbidden: ['Skill({ skill: "repo-rag" })', 'Skill({ skill: "qa-workflow" })'],
  },
  {
    file: '.claude/workflows/core/skill-lifecycle.md',
    forbidden: ['Skill({ skill: "qa-workflow" })'],
  },
  {
    file: '.claude/workflows/database-architect-skill-workflow.md',
    forbidden: ['Skill({ skill: "brainstorming" })', 'brainstorming'],
  },
];

test('workflow docs do not reference archived phantom skills', () => {
  for (const check of checks) {
    const content = fs.readFileSync(check.file, 'utf8');
    for (const snippet of check.forbidden) {
      assert.equal(
        content.includes(snippet),
        false,
        `${check.file} still contains archived skill reference: ${snippet}`
      );
    }
  }
});
