'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL_CREATOR_DIR = path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-creator');
const AGENT_CREATOR_DIR = path.join(PROJECT_ROOT, '.claude', 'skills', 'agent-creator');

function listMarkdownFilesRecursive(dirPath) {
  const results = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listMarkdownFilesRecursive(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function getRelativeProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');
}

function assertNoPatternInMarkdown(dirPath, pattern, message) {
  const matches = [];
  for (const filePath of listMarkdownFilesRecursive(dirPath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (pattern.test(content)) {
      matches.push(getRelativeProjectPath(filePath));
    }
  }

  assert.deepEqual(matches, [], `${message}: ${matches.join(', ')}`);
}

test('skill-creator uses a script-first canonical creation path', () => {
  const skillFile = path.join(SKILL_CREATOR_DIR, 'SKILL.md');
  const skillContent = fs.readFileSync(skillFile, 'utf8');

  assert.match(skillContent, /\*\*Mode:\s*Script-First/i);
  assert.match(skillContent, /scripts\/create\.cjs --name <skill-name>/);
  assert.doesNotMatch(skillContent, /No standalone utility script/i);

  const followUpDoc = fs.readFileSync(
    path.join(SKILL_CREATOR_DIR, 'docs', 'examples-and-evaluation.md'),
    'utf8'
  );
  assert.match(followUpDoc, /Follow-Up/i);
});

test('agent-creator uses a script-first canonical creation path', () => {
  const skillFile = path.join(AGENT_CREATOR_DIR, 'SKILL.md');
  const skillContent = fs.readFileSync(skillFile, 'utf8');

  assert.match(skillContent, /\*\*Mode:\s*Script-First/i);
  assert.match(skillContent, /scripts\/main\.cjs --action generate --name <agent-name>/);
  assert.doesNotMatch(skillContent, /Prompt \+ Scripted Guardrails/i);

  const followUpDoc = fs.readFileSync(
    path.join(AGENT_CREATOR_DIR, 'docs', 'occupational-alignment.md'),
    'utf8'
  );
  assert.match(followUpDoc, /Follow-Up/i);
});

test('creator docs no longer instruct cross-invocation between skill-creator and agent-creator', () => {
  assertNoPatternInMarkdown(
    SKILL_CREATOR_DIR,
    /Skill\(\{\s*skill:\s*['"]agent-creator['"]/,
    'skill-creator should not invoke agent-creator inline'
  );
  assertNoPatternInMarkdown(
    SKILL_CREATOR_DIR,
    /(spawn|invok(?:e|ing))\s+agent-creator/i,
    'skill-creator should not direct inline agent-creator escalation'
  );
  assertNoPatternInMarkdown(
    AGENT_CREATOR_DIR,
    /Skill\(\{\s*skill:\s*['"]skill-creator['"]/,
    'agent-creator should not invoke skill-creator inline'
  );
  assertNoPatternInMarkdown(
    AGENT_CREATOR_DIR,
    /(spawn|invok(?:e|ing))\s+skill-creator/i,
    'agent-creator should not direct inline skill-creator escalation'
  );
  assertNoPatternInMarkdown(
    SKILL_CREATOR_DIR,
    /Bidirectional Gap/i,
    'skill-creator should not retain Bidirectional Gap guidance'
  );
  assertNoPatternInMarkdown(
    AGENT_CREATOR_DIR,
    /Bidirectional Gap/i,
    'agent-creator should not retain Bidirectional Gap guidance'
  );
});
