'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '../../');

test('pipeline-evaluator SKILL.md exists', () => {
  assert.ok(fs.existsSync(path.join(PROJECT, '.claude/skills/pipeline-evaluator/SKILL.md')));
});

test('pipeline-evaluation schema exists', () => {
  assert.ok(fs.existsSync(path.join(PROJECT, '.claude/schemas/pipeline-evaluation.schema.json')));
});

test('skill contains scoring dimensions', () => {
  const content = fs.readFileSync(
    path.join(PROJECT, '.claude/skills/pipeline-evaluator/SKILL.md'),
    'utf8'
  );
  assert.match(content, /task completion|completion rate/i, 'Must score task completion');
  assert.match(content, /deviation/i, 'Must score deviations');
  assert.match(content, /test.*pass|quality/i, 'Must score test quality');
});

test('schema has required evaluation fields', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(PROJECT, '.claude/schemas/pipeline-evaluation.schema.json'), 'utf8')
  );
  assert.ok(schema.properties.pipelineId, 'Schema must have pipelineId');
  assert.ok(schema.properties.scores, 'Schema must have scores');
  assert.ok(schema.properties.verdict, 'Schema must have verdict');
});
