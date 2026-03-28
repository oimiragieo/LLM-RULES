'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const hook = require('../../.claude/hooks/workflow/post-creation-integration.cjs');

function writeTempArtifact(prefix, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const filePath = path.join(dir, `${prefix}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

test('validateArtifactQuality flags TODO placeholders and missing skill sections', () => {
  const skillPath = writeTempArtifact(
    'invalid-skill',
    [
      '---',
      'name: invalid-skill',
      'description: Broken skill',
      'version: 1.0.0',
      'agents: [developer]',
      'category: testing',
      'tags: [todo]',
      '---',
      '',
      '# Invalid Skill',
      '',
      'TODO: finish this later.',
      '',
      '## Memory Protocol',
      '',
      '- Record learnings.',
    ].join('\n')
  );

  const result = hook.validateArtifactQuality('skill', skillPath);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => /TODO/i.test(issue)));
  assert.ok(result.issues.some(issue => /50 lines/i.test(issue)));
  assert.ok(result.issues.some(issue => /identity/i.test(issue)));
  assert.ok(result.issues.some(issue => /capabilities/i.test(issue)));
});

test('validateArtifactQuality accepts sufficiently complete agents', () => {
  const filler = Array.from({ length: 24 }, (_, index) => `- Capability line ${index + 1}`).join(
    '\n'
  );
  const agentPath = writeTempArtifact(
    'valid-agent',
    [
      '---',
      'name: valid-agent',
      'description: Reliable validation agent',
      'model: sonnet',
      'category: quality',
      'skills:',
      '  - task-management-protocol',
      'tools: [Read, Write]',
      '---',
      '',
      '# Valid Agent',
      '',
      '## Core Persona',
      '',
      'Identity: Validation specialist',
      'Style: Direct',
      '',
      '## Workflow',
      '',
      '1. Read context.',
      '2. Validate output.',
      '',
      '## Memory Protocol',
      '',
      '- Record decisions.',
      '',
      filler,
    ].join('\n')
  );

  const result = hook.validateArtifactQuality('agent', agentPath);

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.ok(result.lineCount >= 30);
});

test('processCreatorCompletion surfaces structured quality warnings to the creator', async () => {
  const skillPath = writeTempArtifact(
    'warn-skill',
    [
      '---',
      'name: warn-skill',
      'description: Broken skill',
      'version: 1.0.0',
      'agents: [developer]',
      'category: testing',
      'tags: [todo]',
      '---',
      '',
      '# Warn Skill',
      '',
      'TODO: still unfinished.',
    ].join('\n')
  );

  if (fs.existsSync(hook.QUEUE_PATH)) {
    fs.rmSync(hook.QUEUE_PATH, { force: true });
  }

  const result = await hook.processCreatorCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          creatorType: 'skill',
          artifactId: 'skill:warn-skill',
          artifactPath: skillPath,
        },
      },
    },
  });

  assert.equal(result.result.allow, true);
  assert.match(result.result.message, /quality validation failed/i);
  assert.match(result.result.message, /TODO/i);
  assert.match(result.result.message, /50 lines/i);

  if (fs.existsSync(hook.QUEUE_PATH)) {
    fs.rmSync(hook.QUEUE_PATH, { force: true });
  }
});
