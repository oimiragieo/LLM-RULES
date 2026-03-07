'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  walkAgentFiles,
  getSkillVariants,
  parseFrontmatterSkills,
  extractInvokedSkills,
  validateAgentSkillReferences,
} = require('../../../.claude/tools/cli/validate-agent-skill-references.cjs');

describe('validate-agent-skill-references', () => {
  test('getSkillVariants resolves creator canonical and nested aliases', () => {
    const canonical = getSkillVariants('command-creator');
    assert.ok(canonical.includes('command-creator'));
    assert.ok(canonical.includes('creators/command-creator'));

    const nested = getSkillVariants('creators/rule-creator');
    assert.ok(nested.includes('rule-creator'));
    assert.ok(nested.includes('creators/rule-creator'));
  });

  test('parseFrontmatterSkills supports yaml array lists', () => {
    const content = `---\nname: agent\nskills:\n  - tdd\n  - creators/command-creator\n---\nbody`;
    const skills = parseFrontmatterSkills(content);
    assert.deepEqual(skills, ['tdd', 'creators/command-creator']);
  });

  test('extractInvokedSkills reads Skill invocation references', () => {
    const content = `Do this\nSkill({ skill: 'tdd' })\nSkill({ skill: "creators/command-creator" })`;
    const refs = extractInvokedSkills(content);
    assert.deepEqual(refs, ['tdd', 'creators/command-creator']);
  });

  test('walkAgentFiles excludes README and _archive', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-refs-'));
    const agentsRoot = path.join(root, '.claude', 'agents');
    fs.mkdirSync(path.join(agentsRoot, 'core'), { recursive: true });
    fs.mkdirSync(path.join(agentsRoot, '_archive', 'old'), { recursive: true });
    fs.writeFileSync(path.join(agentsRoot, 'core', 'developer.md'), '# developer', 'utf8');
    fs.writeFileSync(path.join(agentsRoot, 'README.md'), '# readme', 'utf8');
    fs.writeFileSync(path.join(agentsRoot, '_archive', 'old', 'agent.md'), '# old', 'utf8');

    const files = walkAgentFiles(agentsRoot).map(f => f.replace(/\\/g, '/'));
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('/core/developer.md'));

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('validateAgentSkillReferences passes for canonical+nested creator aliases', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-refs-pass-'));
    const agentsRoot = path.join(root, '.claude', 'agents');
    const idxPath = path.join(root, '.claude', 'config', 'skill-index.json');

    fs.mkdirSync(path.join(agentsRoot, 'orchestrators'), { recursive: true });
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });

    fs.writeFileSync(
      path.join(agentsRoot, 'orchestrators', 'evo.md'),
      `---\nname: evo\nskills:\n  - command-creator\n---\nSkill({ skill: 'creators/command-creator' })`,
      'utf8'
    );

    fs.writeFileSync(
      idxPath,
      JSON.stringify({
        skills: {
          'creators/command-creator': {
            name: 'creators/command-creator',
            requiredTools: ['Task'],
          },
          'command-creator': {
            name: 'command-creator',
            aliasOf: 'creators/command-creator',
            requiredTools: ['Task'],
          },
        },
      }),
      'utf8'
    );

    const result = validateAgentSkillReferences({ agentsRoot, skillIndexPath: idxPath });
    assert.equal(result.pass, true);
    assert.equal(result.issues.length, 0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('validateAgentSkillReferences fails on unknown references', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-refs-fail-'));
    const agentsRoot = path.join(root, '.claude', 'agents');
    const idxPath = path.join(root, '.claude', 'config', 'skill-index.json');

    fs.mkdirSync(path.join(agentsRoot, 'core'), { recursive: true });
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });

    fs.writeFileSync(
      path.join(agentsRoot, 'core', 'developer.md'),
      `---\nname: developer\nskills:\n  - tdd\n---\nSkill({ skill: 'missing-skill' })`,
      'utf8'
    );
    fs.writeFileSync(
      idxPath,
      JSON.stringify({ skills: { tdd: { requiredTools: ['Read'] } } }),
      'utf8'
    );

    const result = validateAgentSkillReferences({ agentsRoot, skillIndexPath: idxPath });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('missing-skill')));

    fs.rmSync(root, { recursive: true, force: true });
  });
  test('validateAgentSkillReferences ignores placeholder skill tokens in docs examples', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-refs-placeholders-'));
    const agentsRoot = path.join(root, '.claude', 'agents');
    const idxPath = path.join(root, '.claude', 'config', 'skill-index.json');

    fs.mkdirSync(path.join(agentsRoot, 'core'), { recursive: true });
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });

    fs.writeFileSync(
      path.join(agentsRoot, 'core', 'developer.md'),
      `Skill({ skill: '<skill-name>' })\nSkill({ skill: 'name' })`,
      'utf8'
    );
    fs.writeFileSync(idxPath, JSON.stringify({ skills: {} }), 'utf8');

    const result = validateAgentSkillReferences({ agentsRoot, skillIndexPath: idxPath });
    assert.equal(result.pass, true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('validateAgentSkillReferences accepts scientific shorthand references', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-refs-scientific-'));
    const agentsRoot = path.join(root, '.claude', 'agents');
    const idxPath = path.join(root, '.claude', 'config', 'skill-index.json');

    fs.mkdirSync(path.join(agentsRoot, 'domain'), { recursive: true });
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });

    fs.writeFileSync(
      path.join(agentsRoot, 'domain', 'scientific-research-expert.md'),
      `Skill({ skill: 'scientific-skills/rdkit' })`,
      'utf8'
    );
    fs.writeFileSync(
      idxPath,
      JSON.stringify({
        skills: {
          'scientific-skills/skills/rdkit': { requiredTools: ['Read'] },
        },
      }),
      'utf8'
    );

    const result = validateAgentSkillReferences({ agentsRoot, skillIndexPath: idxPath });
    assert.equal(result.pass, true);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
