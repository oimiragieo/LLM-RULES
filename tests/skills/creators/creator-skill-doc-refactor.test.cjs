'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  if (content.length === 0) {
    return 0;
  }
  return content.endsWith('\n') ? content.slice(0, -1).split('\n').length : content.split('\n').length;
}

function listMarkdownFiles(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

function sumLineCounts(filePaths) {
  return filePaths.reduce((sum, filePath) => sum + countLines(filePath), 0);
}

test('skill-creator SKILL.md is slimmed and reference content moves into local docs/', () => {
  const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-creator');
  const skillFile = path.join(skillDir, 'SKILL.md');
  const docsDir = path.join(skillDir, 'docs');

  assert.equal(countLines(skillFile) <= 500, true, 'skill-creator/SKILL.md must be <= 500 lines');
  assert.equal(fs.existsSync(docsDir), true, 'skill-creator/docs must exist');

  const docs = listMarkdownFiles(docsDir);
  assert.deepEqual(docs, [
    'enterprise-bundle.md',
    'examples-and-evaluation.md',
    'integration-reference.md',
    'research-gate.md',
  ]);

  const skillContent = fs.readFileSync(skillFile, 'utf8');
  assert.match(skillContent, /## Purpose/);
  assert.match(skillContent, /### Step 0: Existence Check and Updater Delegation/);
  assert.match(skillContent, /### Step 0\.1: Smart Duplicate Detection/);
  assert.match(skillContent, /## Post-Creation Checklist/);
  assert.match(skillContent, /## Template Reference/);
  assert.match(skillContent, /\.\/*docs\/research-gate\.md/);
  assert.match(skillContent, /\.\/*docs\/integration-reference\.md/);

  const totalLines = sumLineCounts([
    skillFile,
    ...docs.map((doc) => path.join(docsDir, doc)),
  ]);
  assert.equal(totalLines, 2160);
});

test('agent-creator SKILL.md is slimmed and reference content moves into local docs/', () => {
  const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', 'agent-creator');
  const skillFile = path.join(skillDir, 'SKILL.md');
  const docsDir = path.join(skillDir, 'docs');

  assert.equal(countLines(skillFile) <= 500, true, 'agent-creator/SKILL.md must be <= 500 lines');
  assert.equal(fs.existsSync(docsDir), true, 'agent-creator/docs must exist');

  const docs = listMarkdownFiles(docsDir);
  assert.deepEqual(docs, [
    'examples-and-evaluation.md',
    'integration-reference.md',
    'occupational-alignment.md',
    'research-and-skills-gap.md',
  ]);

  const skillContent = fs.readFileSync(skillFile, 'utf8');
  assert.match(skillContent, /## When This Skill Is Triggered/);
  assert.match(skillContent, /### Step 0: Existence Check and Updater Delegation/);
  assert.match(skillContent, /### Step 0\.1: Smart Duplicate Detection/);
  assert.match(skillContent, /### Step 5: Generate Agent Definition/);
  assert.match(skillContent, /## Post-Creation Checklist/);
  assert.match(skillContent, /\.\/*docs\/occupational-alignment\.md/);
  assert.match(skillContent, /\.\/*docs\/research-and-skills-gap\.md/);

  const totalLines = sumLineCounts([
    skillFile,
    ...docs.map((doc) => path.join(docsDir, doc)),
  ]);
  assert.equal(totalLines, 1810);
});
