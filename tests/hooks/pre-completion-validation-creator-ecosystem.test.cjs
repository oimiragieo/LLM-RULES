'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

test('isEcosystemCreatorAction returns true when creator keyword appears in summary', () => {
  const params = {
    metadata: {
      summary: 'Run skill-creator to update tool scaffolding',
      filesModified: [],
      filesCreated: [],
    },
  };

  assert.equal(hook.isEcosystemCreatorAction(params), true);
});

test('isEcosystemCreatorAction returns false for non-creator task metadata', () => {
  const params = {
    metadata: {
      summary: 'Refactor logging utility and add tests',
      filesModified: ['src/logging/logger.cjs'],
      filesCreated: [],
    },
  };

  assert.equal(hook.isEcosystemCreatorAction(params), false);
});

test('validateCreatorEcosystem honors validator path override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-ecosystem-'));
  const validatorPath = path.join(tmpDir, 'validator.cjs');

  fs.writeFileSync(validatorPath, 'process.exit(1);\n', 'utf8');
  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = validatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
  const freshHook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

  const result = freshHook.validateCreatorEcosystem();
  assert.equal(result.passed, false);
  assert.ok(result.issues.length >= 1);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
});

test('validateCreatorEcosystem enforces strict skill ecosystem gate with --min-score', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-ecosystem-gate-'));
  const creatorValidatorPath = path.join(tmpDir, 'creator-validator.cjs');
  const skillValidatorPath = path.join(tmpDir, 'skill-validator.cjs');

  fs.writeFileSync(creatorValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(
    skillValidatorPath,
    `
if (process.argv.includes('--min-score')) {
  process.exit(0);
}
process.exit(1);
`,
    'utf8'
  );

  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = creatorValidatorPath;
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH = skillValidatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
  const freshHook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

  const result = freshHook.validateCreatorEcosystem();
  assert.equal(result.passed, true);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
});

test('validateCreatorEcosystem fails when strict skill ecosystem gate fails', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-ecosystem-gate-fail-'));
  const creatorValidatorPath = path.join(tmpDir, 'creator-validator.cjs');
  const skillValidatorPath = path.join(tmpDir, 'skill-validator.cjs');

  fs.writeFileSync(creatorValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(skillValidatorPath, 'process.exit(1);\n', 'utf8');

  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = creatorValidatorPath;
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH = skillValidatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
  const freshHook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

  const result = freshHook.validateCreatorEcosystem();
  assert.equal(result.passed, false);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
});

test('validateCreatorEcosystem fails when agent skill reference validator fails', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-ref-fail-'));
  const creatorValidatorPath = path.join(tmpDir, 'creator-validator.cjs');
  const skillValidatorPath = path.join(tmpDir, 'skill-validator.cjs');
  const agentSkillValidatorPath = path.join(tmpDir, 'agent-skill-validator.cjs');

  fs.writeFileSync(creatorValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(skillValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(agentSkillValidatorPath, 'process.exit(1);\n', 'utf8');

  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = creatorValidatorPath;
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH = skillValidatorPath;
  process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH = agentSkillValidatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
  const freshHook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

  const result = freshHook.validateCreatorEcosystem();
  assert.equal(result.passed, false);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
});
