'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREATE_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'skill-creator',
  'scripts',
  'create.cjs'
);

function cleanupSkill(name) {
  const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', name);
  const workflowPath = path.join(PROJECT_ROOT, '.claude', 'workflows', `${name}-skill-workflow.md`);
  const toolDir = path.join(PROJECT_ROOT, '.claude', 'tools', name);

  fs.rmSync(skillDir, { recursive: true, force: true });
  fs.rmSync(workflowPath, { force: true });
  fs.rmSync(toolDir, { recursive: true, force: true });
}

test('create.cjs enterprise defaults scaffold full skill bundle', () => {
  const name = `enterprise-skill-test-${Date.now()}`;
  const description =
    'Enterprise scaffold validation skill for test coverage and reliability checks.';

  cleanupSkill(name);

  try {
    const result = spawnSync(
      'node',
      [
        CREATE_SCRIPT,
        '--name',
        name,
        '--description',
        description,
        '--no-memory',
        '--no-auto-assign',
        '--no-hook-assessment',
      ],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', name);
    assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'scripts', 'main.cjs')), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'hooks', 'pre-execute.cjs')), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'hooks', 'post-execute.cjs')), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'schemas', 'input.schema.json')), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'schemas', 'output.schema.json')), true);
    assert.equal(
      fs.existsSync(path.join(skillDir, 'templates', 'implementation-template.md')),
      true
    );
    assert.equal(fs.existsSync(path.join(skillDir, 'rules', `${name}.md`)), true);
    assert.equal(fs.existsSync(path.join(skillDir, 'commands', `${name}.md`)), true);
    assert.equal(
      fs.existsSync(path.join(skillDir, 'references', 'research-requirements.md')),
      true
    );

    const workflowPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'workflows',
      `${name}-skill-workflow.md`
    );
    const toolPath = path.join(PROJECT_ROOT, '.claude', 'tools', name, `${name}.cjs`);
    assert.equal(fs.existsSync(workflowPath), true);
    assert.equal(fs.existsSync(toolPath), true);

    const researchDoc = fs.readFileSync(
      path.join(skillDir, 'references', 'research-requirements.md'),
      'utf8'
    );
    assert.match(researchDoc, /Exa MCP search/);
    assert.match(researchDoc, /WebFetch \+ arXiv fallback/);
  } finally {
    cleanupSkill(name);
  }
});
