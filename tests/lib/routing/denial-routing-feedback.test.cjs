#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getDenialFeedback } = require('../../../.claude/lib/routing/denial-feedback-reader.cjs');

function writeAgent(agentsDir, relativePath, name, tools, { inline = false } = {}) {
  const filePath = path.join(agentsDir, relativePath);
  const toolsBlock = inline
    ? `tools: [${tools.join(', ')}]`
    : `tools:\n${tools.map(tool => `  - ${tool}`).join('\n')}`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\nname: ${name}\n${toolsBlock}\n---\n# ${name}\n`, 'utf8');
}

function writeDenialLog(filePath, tools) {
  const entries = tools.map((tool, index) => ({
    tool,
    reason: 'permission denied',
    timestamp: `2026-04-01T00:00:0${index}.000Z`,
    session_id: `session-${index}`,
  }));

  fs.writeFileSync(filePath, JSON.stringify(entries), 'utf8');
}

test('3+ Bash denials triggers suggestions for agents without Bash', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-routing-feedback-'));
  const agentsDir = path.join(tmpDir, 'agents');
  const logFile = path.join(tmpDir, 'denial-log.json');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  writeAgent(agentsDir, path.join('core', 'bash-agent.md'), 'bash-agent', ['Read', 'Bash']);
  writeAgent(agentsDir, path.join('core', 'reader-agent.md'), 'reader-agent', ['Read']);
  writeAgent(
    agentsDir,
    path.join('specialized', 'writer-agent.md'),
    'writer-agent',
    ['Read', 'Write'],
    { inline: true }
  );
  writeDenialLog(logFile, ['Bash', 'Bash', 'Bash']);

  const feedback = getDenialFeedback(logFile, { agentsDir });

  assert.equal(feedback.totalDenials, 3);
  assert.equal(feedback.suggestions.length, 1);
  assert.equal(feedback.suggestions[0].deniedTool, 'Bash');
  assert.equal(feedback.suggestions[0].denialCount, 3);
  assert.deepEqual(feedback.suggestions[0].agentNames, ['reader-agent', 'writer-agent']);
  assert.deepEqual(
    feedback.suggestions[0].alternatives.map(agent => agent.name),
    ['reader-agent', 'writer-agent']
  );
  assert.ok(feedback.suggestions[0].alternatives.every(agent => !agent.tools.includes('Bash')));
});

test('missing denial log returns empty suggestions', () => {
  const missingLogFile = path.join(os.tmpdir(), `missing-denial-log-${Date.now()}.json`);
  const feedback = getDenialFeedback(missingLogFile);

  assert.equal(feedback.totalDenials, 0);
  assert.equal(feedback.fileExists, false);
  assert.deepEqual(feedback.suggestions, []);
});

test('empty denial log returns empty suggestions', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-routing-feedback-empty-'));
  const logFile = path.join(tmpDir, 'denial-log.json');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  fs.writeFileSync(logFile, '', 'utf8');

  const feedback = getDenialFeedback(logFile);

  assert.equal(feedback.totalDenials, 0);
  assert.equal(feedback.fileExists, true);
  assert.deepEqual(feedback.suggestions, []);
});

test('corrupted denial log returns empty suggestions without throwing', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-routing-feedback-corrupt-'));
  const logFile = path.join(tmpDir, 'denial-log.json');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  fs.writeFileSync(logFile, '{ definitely-not-json', 'utf8');

  assert.doesNotThrow(() => getDenialFeedback(logFile));

  const feedback = getDenialFeedback(logFile);

  assert.equal(feedback.totalDenials, 0);
  assert.equal(feedback.fileExists, true);
  assert.deepEqual(feedback.suggestions, []);
});

test('suggestions include agent names', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-routing-feedback-names-'));
  const agentsDir = path.join(tmpDir, 'agents');
  const logFile = path.join(tmpDir, 'denial-log.json');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  writeAgent(agentsDir, 'alpha.md', 'alpha', ['Read', 'Write']);
  writeAgent(agentsDir, 'bravo.md', 'bravo', ['Read']);
  writeDenialLog(logFile, ['Bash', 'Bash', 'Bash']);

  const feedback = getDenialFeedback(logFile, { agentsDir });
  const suggestion = feedback.suggestions[0];

  assert.ok(suggestion.agentNames.includes('alpha'));
  assert.ok(suggestion.agentNames.includes('bravo'));
  assert.ok(suggestion.message.includes('alpha'));
  assert.ok(suggestion.message.includes('bravo'));
});
