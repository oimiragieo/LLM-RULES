#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const REQUIRED_MARKERS = [
  '## Ecosystem Alignment Contract (MANDATORY)',
  '### Cross-Creator Handshake (Required)',
  '### Research Gate (Exa + arXiv — BOTH MANDATORY)',
  '### Regression-Safe Delivery',
];

const CREATOR_SKILL_FILES = {
  'agent-creator': '.claude/skills/agent-creator/SKILL.md',
  'command-creator': '.claude/skills/command-creator/SKILL.md',
  'rule-creator': '.claude/skills/rule-creator/SKILL.md',
  'tool-creator': '.claude/skills/tool-creator/SKILL.md',
  'hook-creator': '.claude/skills/hook-creator/SKILL.md',
  'semgrep-rule-creator': '.claude/skills/semgrep-rule-creator/SKILL.md',
  'skill-creator': '.claude/skills/skill-creator/SKILL.md',
  'template-creator': '.claude/skills/template-creator/SKILL.md',
  'workflow-creator': '.claude/skills/workflow-creator/SKILL.md',
};

function validateSkillContent(skillName, content) {
  const issues = [];

  for (const marker of REQUIRED_MARKERS) {
    if (!content.includes(marker)) {
      issues.push(`${skillName}: missing marker "${marker}"`);
    }
  }

  return { pass: issues.length === 0, issues };
}

function validateSkillFile(skillName, relativePath) {
  const absolutePath = path.join(PROJECT_ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      pass: false,
      issues: [`${skillName}: missing file ${relativePath}`],
    };
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  return validateSkillContent(skillName, content);
}

function runValidation() {
  const issues = [];

  for (const [skillName, relativePath] of Object.entries(CREATOR_SKILL_FILES)) {
    const result = validateSkillFile(skillName, relativePath);
    issues.push(...result.issues);
  }

  return {
    pass: issues.length === 0,
    issues,
    checked: Object.keys(CREATOR_SKILL_FILES).length,
  };
}

function main() {
  const result = runValidation();

  if (result.pass) {
    console.log(`Creator ecosystem alignment check passed (${result.checked} skills).`);
    process.exit(0);
  }

  console.error('Creator ecosystem alignment check failed:');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }

  process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'validate-creator-ecosystem');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  REQUIRED_MARKERS,
  CREATOR_SKILL_FILES,
  validateSkillContent,
  validateSkillFile,
  runValidation,
};
