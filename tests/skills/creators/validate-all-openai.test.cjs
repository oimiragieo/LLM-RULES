'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const VALIDATOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'skill-creator',
  'scripts',
  'validate-all.cjs'
);

const { validateOpenAiYaml } = require(VALIDATOR_PATH);

test('validateOpenAiYaml warns when file is missing', () => {
  const tmpSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-missing-'));
  const result = validateOpenAiYaml(tmpSkillDir, 'demo-skill');
  assert.deepStrictEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('Missing agents/openai.yaml')));
});

test('validateOpenAiYaml validates default_prompt and short_description bounds', () => {
  const tmpSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-openai-'));
  const agentsDir = path.join(tmpSkillDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, 'openai.yaml'),
    `interface:
  display_name: Demo Skill
  short_description: Too short
  default_prompt: "Use this without explicit skill mention."
`,
    'utf8'
  );

  const result = validateOpenAiYaml(tmpSkillDir, 'demo-skill');
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.warnings.some(w => w.includes('25-64 chars')));
  assert.ok(result.warnings.some(w => w.includes('$demo-skill')));
});
