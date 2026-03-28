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

const keywordsFile = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'routing-table-intent-keywords.cjs'
);
const agentsFile = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'routing-table-intent-agents.cjs'
);

function cleanupSkill(name) {
  const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', name);
  const workflowPath = path.join(PROJECT_ROOT, '.claude', 'workflows', `${name}-skill-workflow.md`);
  const toolDir = path.join(PROJECT_ROOT, '.claude', 'tools', name);

  fs.rmSync(skillDir, { recursive: true, force: true });
  fs.rmSync(workflowPath, { force: true });
  fs.rmSync(toolDir, { recursive: true, force: true });
}

test('create.cjs defaults to minimal scaffold unless --enterprise is provided', () => {
  const name = `enterprise-skill-test-${Date.now()}`;
  const description =
    'Enterprise scaffold validation skill for test coverage and reliability checks.';

  // Save routing tables before test to allow reliable restore
  let savedKeywords;
  let savedAgents;
  try {
    savedKeywords = fs.readFileSync(keywordsFile, 'utf8');
  } catch {
    // file may not exist in test environment
  }
  try {
    savedAgents = fs.readFileSync(agentsFile, 'utf8');
  } catch {
    // file may not exist in test environment
  }

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
    assert.equal(fs.existsSync(path.join(skillDir, 'hooks', 'pre-execute.cjs')), false);
    assert.equal(fs.existsSync(path.join(skillDir, 'hooks', 'post-execute.cjs')), false);
    assert.equal(fs.existsSync(path.join(skillDir, 'schemas', 'input.schema.json')), false);
    assert.equal(fs.existsSync(path.join(skillDir, 'schemas', 'output.schema.json')), false);
    assert.equal(
      fs.existsSync(path.join(skillDir, 'templates', 'implementation-template.md')),
      false
    );
    assert.equal(fs.existsSync(path.join(skillDir, 'rules', `${name}.md`)), false);
    assert.equal(fs.existsSync(path.join(skillDir, 'commands', `${name}.md`)), false);
    assert.equal(
      fs.existsSync(path.join(skillDir, 'references', 'research-requirements.md')),
      false
    );

    const workflowPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'workflows',
      `${name}-skill-workflow.md`
    );
    const toolPath = path.join(PROJECT_ROOT, '.claude', 'tools', name, `${name}.cjs`);
    assert.equal(fs.existsSync(workflowPath), false);
    assert.equal(fs.existsSync(toolPath), false);
  } finally {
    cleanupSkill(name);
    // Restore routing tables to pre-test state (snapshot/restore pattern)
    if (savedKeywords) fs.writeFileSync(keywordsFile, savedKeywords, 'utf8');
    if (savedAgents) fs.writeFileSync(agentsFile, savedAgents, 'utf8');
  }
});

test('create.cjs creates enterprise bundle only when --enterprise is provided', () => {
  const name = `enterprise-skill-test-${Date.now()}-explicit`;
  const description = 'Explicit enterprise scaffold validation skill for test coverage.';

  let savedKeywords;
  let savedAgents;
  try {
    savedKeywords = fs.readFileSync(keywordsFile, 'utf8');
  } catch (_err) {
    savedKeywords = undefined;
  }
  try {
    savedAgents = fs.readFileSync(agentsFile, 'utf8');
  } catch (_err) {
    savedAgents = undefined;
  }

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
        '--enterprise',
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
  } finally {
    cleanupSkill(name);
    if (savedKeywords) fs.writeFileSync(keywordsFile, savedKeywords, 'utf8');
    if (savedAgents) fs.writeFileSync(agentsFile, savedAgents, 'utf8');
  }
});
