'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'skill-creator',
  'scripts',
  'generate-openai-yaml.cjs'
);

const {
  deriveShortDescription,
  extractMcpDependencies,
  buildOpenAiYaml,
  generateForSkill,
} = require(SCRIPT_PATH);

test('deriveShortDescription returns values inside required range', () => {
  const short = deriveShortDescription('Small');
  assert.ok(short.length >= 25 && short.length <= 64);

  const long = deriveShortDescription(
    'This description is intentionally very long and should be clipped to ensure compatibility with UI summary constraints.'
  );
  assert.ok(long.length >= 25 && long.length <= 64);
});

test('extractMcpDependencies finds unique MCP servers', () => {
  const content = `
Use mcp__exa__search and mcp__arxiv__lookup in this skill.
Another call: mcp__exa__web_search.
`;
  const deps = extractMcpDependencies(content);
  assert.deepStrictEqual(deps, [
    { type: 'mcp', value: 'arxiv' },
    { type: 'mcp', value: 'exa' },
  ]);
});

test('buildOpenAiYaml includes default prompt skill mention', () => {
  const doc = buildOpenAiYaml(
    'skill-creator',
    'Create, validate, and convert skills for the agent ecosystem.',
    'No MCP dependencies here.'
  );
  assert.strictEqual(doc.interface.display_name, 'Skill Creator');
  assert.ok(doc.interface.default_prompt.includes('$skill-creator'));
  assert.ok(doc.interface.short_description.length >= 25);
  assert.ok(doc.interface.short_description.length <= 64);
});

test('generateForSkill writes agents/openai.yaml for valid skill', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-openai-gen-'));
  const skillDir = path.join(tmpRoot, 'my-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---
name: my-skill
description: This skill performs robust data extraction and transformation tasks.
---

# My Skill

Use mcp__exa__web_search for discovery.
`,
    'utf8'
  );

  const result = generateForSkill(skillDir, { overwrite: false });
  assert.strictEqual(result.status, 'ok');

  const openAiPath = path.join(skillDir, 'agents', 'openai.yaml');
  assert.ok(fs.existsSync(openAiPath));

  const parsed = yaml.load(fs.readFileSync(openAiPath, 'utf8'));
  assert.strictEqual(parsed.interface.display_name, 'My Skill');
  assert.ok(parsed.interface.default_prompt.includes('$my-skill'));
  assert.deepStrictEqual(parsed.dependencies.tools, [{ type: 'mcp', value: 'exa' }]);
});
