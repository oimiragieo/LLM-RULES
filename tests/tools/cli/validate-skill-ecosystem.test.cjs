'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  findAllSkills,
  evaluateSkill,
  buildSummary,
  isArchivedSkillPath,
  runAudit,
  buildSkillSlug,
} = require('../../../.claude/tools/cli/validate-skill-ecosystem.cjs');

describe('validate-skill-ecosystem', () => {
  test('findAllSkills discovers nested SKILL.md files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');

    fs.mkdirSync(path.join(skillsRoot, 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(skillsRoot, 'alpha', 'SKILL.md'), '# alpha');

    fs.mkdirSync(path.join(skillsRoot, 'nested', 'beta', 'gamma'), { recursive: true });
    fs.writeFileSync(path.join(skillsRoot, 'nested', 'beta', 'gamma', 'SKILL.md'), '# gamma');

    const found = findAllSkills(skillsRoot);
    assert.deepStrictEqual(found.sort(), ['alpha', 'nested/beta/gamma']);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('evaluateSkill recognizes slugged nested companion tool path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');
    const toolsRoot = path.join(root, '.claude', 'tools');
    const workflowsRoot = path.join(root, '.claude', 'workflows');

    const nested = path.join(skillsRoot, 'scientific-skills', 'skills', 'demo-nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'SKILL.md'), '# nested');

    const slug = 'scientific-skills--skills--demo-nested';
    fs.mkdirSync(path.join(toolsRoot, slug), { recursive: true });
    fs.writeFileSync(path.join(toolsRoot, slug, slug + '.cjs'), 'module.exports = {};');

    fs.mkdirSync(workflowsRoot, { recursive: true });
    fs.writeFileSync(path.join(workflowsRoot, slug + '-skill-workflow.md'), '# wf');

    const result = evaluateSkill({
      projectRoot: root,
      skillRelativePath: 'scientific-skills/skills/demo-nested',
    });

    assert.strictEqual(result.checks['tool.companion'], true);
    assert.strictEqual(result.checks['workflow.skill'], true);

    fs.rmSync(root, { recursive: true, force: true });
  });
  test('evaluateSkill reports full compliance and perfect score when all contract files exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');
    const toolsRoot = path.join(root, '.claude', 'tools');
    const workflowsRoot = path.join(root, '.claude', 'workflows');

    const skillPath = path.join(skillsRoot, 'demo');
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# demo');
    fs.mkdirSync(path.join(skillPath, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'scripts', 'main.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(skillPath, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'hooks', 'pre-execute.cjs'), 'module.exports = {};');
    fs.writeFileSync(path.join(skillPath, 'hooks', 'post-execute.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(skillPath, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'schemas', 'input.schema.json'), '{}');
    fs.writeFileSync(path.join(skillPath, 'schemas', 'output.schema.json'), '{}');
    fs.mkdirSync(path.join(skillPath, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'rules', 'demo.md'), '# rule');
    fs.mkdirSync(path.join(skillPath, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'commands', 'demo.md'), '# cmd');
    fs.mkdirSync(path.join(skillPath, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'templates', 'implementation-template.md'), '# tpl');
    fs.mkdirSync(path.join(skillPath, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'references', 'research-requirements.md'), '# refs');
    fs.mkdirSync(path.join(toolsRoot, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(toolsRoot, 'demo', 'demo.cjs'), 'module.exports = {};');
    fs.mkdirSync(workflowsRoot, { recursive: true });
    fs.writeFileSync(path.join(workflowsRoot, 'demo-skill-workflow.md'), '# wf');

    const result = evaluateSkill({
      projectRoot: root,
      skillRelativePath: 'demo',
    });

    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.missing.length, 0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('buildSkillSlug creates nested-safe identifier', () => {
    assert.strictEqual(
      buildSkillSlug('scientific-skills/skills/biopython'),
      'scientific-skills--skills--biopython'
    );
  });

  test('isArchivedSkillPath identifies archived skill paths', () => {
    assert.strictEqual(isArchivedSkillPath('_archive/dead/example'), true);
    assert.strictEqual(isArchivedSkillPath('integration/example'), false);
  });

  test('runAudit excludes archived skills by default', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');

    fs.mkdirSync(path.join(skillsRoot, 'active'), { recursive: true });
    fs.writeFileSync(path.join(skillsRoot, 'active', 'SKILL.md'), '# active');

    fs.mkdirSync(path.join(skillsRoot, '_archive', 'dead', 'old-skill'), { recursive: true });
    fs.writeFileSync(path.join(skillsRoot, '_archive', 'dead', 'old-skill', 'SKILL.md'), '# old');

    const report = runAudit({ projectRoot: root });

    assert.strictEqual(report.summary.totalDiscovered, 2);
    assert.strictEqual(report.summary.totalSkills, 1);
    assert.strictEqual(report.summary.archivedExcluded, 1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('buildSummary aggregates missing categories and score buckets', () => {
    const summary = buildSummary([
      { score: 100, missing: [], skill: 'a' },
      { score: 80, missing: ['hooks.pre'], skill: 'b' },
      { score: 20, missing: ['scripts.main', 'workflow'], skill: 'c' },
    ]);

    assert.strictEqual(summary.totalSkills, 3);
    assert.strictEqual(summary.scoreBuckets.perfect, 1);
    assert.strictEqual(summary.scoreBuckets.good, 1);
    assert.strictEqual(summary.scoreBuckets.needsWork, 1);
    assert.strictEqual(summary.missingCounts['hooks.pre'], 1);
    assert.strictEqual(summary.missingCounts.workflow, 1);
  });
});
