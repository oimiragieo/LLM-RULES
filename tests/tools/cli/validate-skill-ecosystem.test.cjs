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
  checkGate,
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

  test('evaluateSkill recognizes updater yaml workflow as workflow contract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');
    const workflowsRoot = path.join(root, '.claude', 'workflows', 'updaters');

    const skillPath = path.join(skillsRoot, 'skill-updater');
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# updater');

    fs.mkdirSync(workflowsRoot, { recursive: true });
    fs.writeFileSync(path.join(workflowsRoot, 'skill-updater-workflow.yaml'), 'name: updater');

    const result = evaluateSkill({
      projectRoot: root,
      skillRelativePath: 'skill-updater',
    });

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

  test('checkGate enforces require-perfect threshold', () => {
    const openGate = checkGate({ scoreBuckets: { needsWork: 3 } }, false);
    assert.strictEqual(openGate.ok, true);

    const strictFail = checkGate({ scoreBuckets: { needsWork: 1 } }, true);
    assert.strictEqual(strictFail.ok, false);

    const strictPass = checkGate({ scoreBuckets: { needsWork: 0 } }, true);
    assert.strictEqual(strictPass.ok, true);
  });

  test('checkGate passes when all skills meet --min-score threshold', () => {
    const results = [
      { skill: 'a', score: 80 },
      { skill: 'b', score: 70 },
      { skill: 'c', score: 100 },
    ];
    const gate = checkGate({ scoreBuckets: { needsWork: 1 } }, false, results, 70);
    assert.strictEqual(gate.ok, true);
    assert.strictEqual(gate.reason, 'min_score_met');
  });

  test('checkGate fails when any skill is below --min-score threshold', () => {
    const results = [
      { skill: 'a', score: 80 },
      { skill: 'b', score: 69 },
      { skill: 'c', score: 100 },
    ];
    const gate = checkGate({ scoreBuckets: { needsWork: 1 } }, false, results, 70);
    assert.strictEqual(gate.ok, false);
    assert.strictEqual(gate.reason, 'below_min_score');
    assert.ok(gate.failing.includes('b'));
  });

  test('checkGate with --min-score 0 always passes', () => {
    const results = [{ skill: 'a', score: 0 }];
    const gate = checkGate({ scoreBuckets: { needsWork: 1 } }, false, results, 0);
    assert.strictEqual(gate.ok, true);
  });

  test('checkGate --min-score takes precedence over disabled gate when minScore is set', () => {
    // When minScore is provided (even with requirePerfect=false), min-score logic applies
    const results = [{ skill: 'a', score: 50 }];
    const gate = checkGate({ scoreBuckets: { needsWork: 1 } }, false, results, 60);
    assert.strictEqual(gate.ok, false);
    assert.strictEqual(gate.reason, 'below_min_score');
  });

  test('checkGate --require-perfect still works independently of --min-score', () => {
    // requirePerfect=true with needsWork > 0 should still fail (backward compat)
    const gate = checkGate({ scoreBuckets: { needsWork: 2 } }, true, [], null);
    assert.strictEqual(gate.ok, false);
    assert.strictEqual(gate.reason, 'needs_work_present');
  });

  test('checkGate --require-perfect only blocks non-exempt skills in needs-work range', () => {
    const results = [
      { skill: 'hooks-explainer', score: 20 },
      { skill: 'modern-python', score: 92 },
      { skill: 'setup-telegram', score: 5 },
    ];

    const gate = checkGate({ scoreBuckets: { needsWork: 2 } }, true, results, null);

    assert.strictEqual(gate.ok, false);
    assert.strictEqual(gate.reason, 'needs_work_present');
    assert.deepStrictEqual(gate.failing, ['hooks-explainer']);
  });

  test('parseArgs supports --min-score flag', () => {
    const { parseArgs } = require('../../../.claude/tools/cli/validate-skill-ecosystem.cjs');
    const args = parseArgs(['--min-score', '70']);
    assert.strictEqual(args.minScore, 70);
  });

  test('parseArgs --min-score defaults to null when not provided', () => {
    const { parseArgs } = require('../../../.claude/tools/cli/validate-skill-ecosystem.cjs');
    const args = parseArgs([]);
    assert.strictEqual(args.minScore, null);
  });

  test('runAudit gate passes with --min-score 70 when all skills meet threshold', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');
    const toolsRoot = path.join(root, '.claude', 'tools');
    const workflowsRoot = path.join(root, '.claude', 'workflows');

    // Create a fully compliant skill scoring 100
    const skillPath = path.join(skillsRoot, 'full-skill');
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# full-skill');
    fs.mkdirSync(path.join(skillPath, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'scripts', 'main.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(skillPath, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'hooks', 'pre-execute.cjs'), 'module.exports = {};');
    fs.writeFileSync(path.join(skillPath, 'hooks', 'post-execute.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(skillPath, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'schemas', 'input.schema.json'), '{}');
    fs.writeFileSync(path.join(skillPath, 'schemas', 'output.schema.json'), '{}');
    fs.mkdirSync(path.join(skillPath, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'rules', 'full-skill.md'), '# rule');
    fs.mkdirSync(path.join(skillPath, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'commands', 'full-skill.md'), '# cmd');
    fs.mkdirSync(path.join(skillPath, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'templates', 'implementation-template.md'), '# tpl');
    fs.mkdirSync(path.join(skillPath, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'references', 'research-requirements.md'), '# refs');
    fs.mkdirSync(path.join(toolsRoot, 'full-skill'), { recursive: true });
    fs.writeFileSync(path.join(toolsRoot, 'full-skill', 'full-skill.cjs'), 'module.exports = {};');
    fs.mkdirSync(workflowsRoot, { recursive: true });
    fs.writeFileSync(path.join(workflowsRoot, 'full-skill-skill-workflow.md'), '# wf');

    const report = runAudit({ projectRoot: root, minScore: 70 });
    // All skills score 100, so gate should pass
    const gate = checkGate(report.summary, false, report.results, 70);
    assert.strictEqual(gate.ok, true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('runAudit returns results so require-perfect can ignore exempt low-score skills', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-'));
    const skillsRoot = path.join(root, '.claude', 'skills');

    const exemptSkill = path.join(skillsRoot, 'setup-telegram');
    fs.mkdirSync(exemptSkill, { recursive: true });
    fs.writeFileSync(path.join(exemptSkill, 'SKILL.md'), '# setup-telegram');

    const goodSkill = path.join(skillsRoot, 'good-skill');
    fs.mkdirSync(goodSkill, { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'SKILL.md'), '# good-skill');
    fs.mkdirSync(path.join(goodSkill, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'scripts', 'main.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(goodSkill, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'hooks', 'pre-execute.cjs'), 'module.exports = {};');
    fs.writeFileSync(path.join(goodSkill, 'hooks', 'post-execute.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(goodSkill, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'schemas', 'input.schema.json'), '{}');
    fs.writeFileSync(path.join(goodSkill, 'schemas', 'output.schema.json'), '{}');
    fs.mkdirSync(path.join(goodSkill, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'rules', 'good-skill.md'), '# rule');
    fs.mkdirSync(path.join(goodSkill, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'commands', 'good-skill.md'), '# cmd');
    fs.mkdirSync(path.join(goodSkill, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'templates', 'implementation-template.md'), '# template');
    fs.mkdirSync(path.join(goodSkill, 'references'), { recursive: true });
    fs.writeFileSync(path.join(goodSkill, 'references', 'research-requirements.md'), '# refs');

    const report = runAudit({ projectRoot: root });
    const gate = checkGate(report.summary, true, report.results, null);

    assert.strictEqual(Array.isArray(report.results), true);
    assert.strictEqual(gate.ok, true);

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
