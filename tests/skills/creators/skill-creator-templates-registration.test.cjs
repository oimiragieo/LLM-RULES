'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');

const templates = require('../../../.claude/skills/skill-creator/scripts/create-templates.cjs');
const { createActions } = require('../../../.claude/skills/skill-creator/scripts/create-actions.cjs');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'expected YAML frontmatter');
  return yaml.load(match[1]);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createTempProject({ breakRoutingAgents = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-creator-registration-'));
  const claudeDir = path.join(root, '.claude');

  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'tools'), { recursive: true });

  writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Test CLAUDE\n- `framework-context`\n');
  writeFile(
    path.join(claudeDir, 'context', 'artifacts', 'catalogs', 'skill-catalog.md'),
    [
      '## Specialized Patterns',
      '| Skill | Description | Tools |',
      '| --- | --- | --- |',
      '| `existing-skill` | Existing skill | Read |',
      '---',
      '',
    ].join('\n')
  );
  writeFile(
    path.join(claudeDir, 'lib', 'routing', 'routing-table-intent-keywords.cjs'),
    ['const INTENT_KEYWORDS = {', '};', '', 'module.exports = { INTENT_KEYWORDS };', ''].join(
      '\n'
    )
  );
  writeFile(
    path.join(claudeDir, 'lib', 'routing', 'routing-table-intent-agents.cjs'),
    breakRoutingAgents
      ? ['const INTENT_TO_AGENT = {', '};', '', '// broken on purpose', ''].join('\n')
      : [
          'const INTENT_TO_AGENT = {',
          '};',
          '',
          'module.exports = { INTENT_TO_AGENT };',
          '',
        ].join('\n')
  );
  writeFile(
    path.join(claudeDir, 'tools', 'cli', 'generate-skill-index.cjs'),
    [
      '#!/usr/bin/env node',
      "'use strict';",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const projectRoot = path.resolve(__dirname, '..', '..', '..');",
      "const indexPath = path.join(projectRoot, '.claude', 'config', 'skill-index.json');",
      "fs.mkdirSync(path.dirname(indexPath), { recursive: true });",
      "fs.writeFileSync(indexPath, JSON.stringify({ generated: true }, null, 2), 'utf8');",
      '',
    ].join('\n')
  );

  return { root, claudeDir };
}

function makeActions(root) {
  const claudeDir = path.join(root, '.claude');
  return createActions({
    fs,
    path,
    PROJECT_ROOT: root,
    CLAUDE_DIR: claudeDir,
    SKILLS_DIR: path.join(claudeDir, 'skills'),
    AGENTS_DIR: path.join(claudeDir, 'agents'),
    TOOLS_DIR: path.join(claudeDir, 'tools'),
    SETTINGS_PATH: path.join(claudeDir, 'settings.json'),
    STRUCTURE_PATH: path.join(claudeDir, 'references', 'skill-structure.md'),
    formatDirectory: () => {},
    validateData: null,
    templates,
  });
}

test('generateSkillContent populates required skill frontmatter fields', () => {
  const content = templates.generateSkillContent({
    name: 'quality-sentinel',
    description: 'Ensures creator artifacts pass strict validation gates.',
    version: '2.3.4',
    agents: ['developer', 'qa'],
    category: 'quality',
    tags: ['validation', 'creator'],
    tools: ['Read', 'Write'],
  });

  const frontmatter = parseFrontmatter(content);
  assert.equal(frontmatter.name, 'quality-sentinel');
  assert.equal(
    frontmatter.description,
    'Ensures creator artifacts pass strict validation gates.'
  );
  assert.equal(frontmatter.version, '2.3.4');
  assert.deepEqual(frontmatter.agents, ['developer', 'qa']);
  assert.equal(frontmatter.category, 'quality');
  assert.deepEqual(frontmatter.tags, ['validation', 'creator']);
});

test('createSkill defaults to the minimal scaffold unless enterprise is explicitly enabled', () => {
  const { root, claudeDir } = createTempProject();
  const actions = makeActions(root);

  const result = actions.createSkill({
    name: 'minimal-sentinel',
    description: 'Ensures minimal scaffolds stay lean by default.',
    noWorkflow: true,
    noTool: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.enterpriseEnabled, false);
  const skillDir = path.join(claudeDir, 'skills', 'minimal-sentinel');
  assert.equal(fs.existsSync(path.join(skillDir, 'references')), false);
  assert.equal(fs.existsSync(path.join(skillDir, 'hooks')), false);
  assert.equal(fs.existsSync(path.join(skillDir, 'schemas')), false);
  assert.equal(fs.existsSync(path.join(skillDir, 'templates')), false);
  assert.equal(fs.existsSync(path.join(skillDir, 'rules')), false);
  assert.equal(fs.existsSync(path.join(skillDir, 'commands')), false);
});

test('skill-creator SKILL.md documents enterprise scaffolding as opt-in', () => {
  const skillDoc = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'skills', 'skill-creator', 'SKILL.md'),
    'utf8'
  );

  assert.match(skillDoc, /enterprise bundle is now \*\*opt-in\*\*/i);
  assert.doesNotMatch(skillDoc, /By default, new skills still expect the enterprise bundle/i);
});

test('createSkill returns structured per-step registration status on success', () => {
  const { root, claudeDir } = createTempProject();
  const actions = makeActions(root);

  const result = actions.createSkill({
    name: 'quality-sentinel',
    description: 'Ensures creator artifacts pass strict validation gates.',
    enterprise: false,
    noWorkflow: true,
    noTool: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.artifact.type, 'skill');
  assert.equal(result.registration.ok, true);
  assert.deepEqual(Object.keys(result.registration.steps), [
    'claudeMd',
    'skillCatalog',
    'routingKeywords',
    'routingAgents',
    'skillIndex',
  ]);
  for (const step of Object.values(result.registration.steps)) {
    assert.equal(step.status, 'success');
  }

  const skillFile = path.join(claudeDir, 'skills', 'quality-sentinel', 'SKILL.md');
  assert.equal(fs.existsSync(skillFile), true);
});

test('createSkill reports actionable registration errors and rolls back partial artifacts', () => {
  const skillName = 'broken-registration';
  const { root, claudeDir } = createTempProject({ breakRoutingAgents: true });
  const actions = makeActions(root);

  assert.throws(
    () =>
      actions.createSkill({
        name: skillName,
        description: 'Ensures creator artifacts pass strict validation gates.',
        enterprise: false,
        noWorkflow: true,
        noTool: true,
      }),
    error => {
      assert.match(error.message, /registration/i);
      assert.match(error.message, /routingAgents/i);
      assert.match(error.message, /Unable to locate INTENT_TO_AGENT insertion point/i);
      assert.match(error.message, /remediation/i);
      assert.equal(error.result.registration.steps.routingAgents.status, 'failed');
      assert.equal(error.result.registration.steps.skillIndex.status, 'success');
      return true;
    }
  );

  const skillFile = path.join(claudeDir, 'skills', skillName, 'SKILL.md');
  assert.equal(fs.existsSync(skillFile), false);

  const claudeMd = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf8');
  const catalog = fs.readFileSync(
    path.join(claudeDir, 'context', 'artifacts', 'catalogs', 'skill-catalog.md'),
    'utf8'
  );
  assert.doesNotMatch(claudeMd, new RegExp(skillName));
  assert.doesNotMatch(catalog, new RegExp(skillName));
  assert.equal(fs.existsSync(path.join(claudeDir, 'config', 'skill-index.json')), false);
});
