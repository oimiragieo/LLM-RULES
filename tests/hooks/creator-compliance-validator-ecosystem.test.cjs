'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('validateCreatorEcosystemStrict passes when both validators pass', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-compliance-pass-'));
  const creatorValidatorPath = path.join(tmpDir, 'creator-validator.cjs');
  const skillValidatorPath = path.join(tmpDir, 'skill-validator.cjs');

  fs.writeFileSync(creatorValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(
    skillValidatorPath,
    "if (process.argv.includes('--require-perfect')) process.exit(0); process.exit(1);\n",
    'utf8'
  );

  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = creatorValidatorPath;
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH = skillValidatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
  const hook = require('../../.claude/hooks/validation/creator-compliance-validator.cjs');

  const result = hook.validateCreatorEcosystemStrict();
  assert.equal(result.passed, true);
  assert.equal(result.issues.length, 0);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
});

test('validateCreatorEcosystemStrict fails when skill ecosystem gate fails', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-compliance-fail-'));
  const creatorValidatorPath = path.join(tmpDir, 'creator-validator.cjs');
  const skillValidatorPath = path.join(tmpDir, 'skill-validator.cjs');

  fs.writeFileSync(creatorValidatorPath, 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(skillValidatorPath, 'process.exit(1);\n', 'utf8');

  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = creatorValidatorPath;
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH = skillValidatorPath;

  delete require.cache[
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
  const hook = require('../../.claude/hooks/validation/creator-compliance-validator.cjs');

  const result = hook.validateCreatorEcosystemStrict();
  assert.equal(result.passed, false);
  assert.ok(result.issues.length >= 1);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
});
test('validateCreatorEcosystemStrict fails when agent skill reference validator fails', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-compliance-agent-skill-fail-'));
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
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
  const hook = require('../../.claude/hooks/validation/creator-compliance-validator.cjs');

  const result = hook.validateCreatorEcosystemStrict();
  assert.equal(result.passed, false);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH;
  delete process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/creator-compliance-validator.cjs')
  ];
});
