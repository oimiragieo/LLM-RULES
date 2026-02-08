#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { isCreatorCompletion, processCreatorCompletion } = require('./post-creation-integration.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const QUEUE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'integration-queue.jsonl');

test('isCreatorCompletion detects skill-creator metadata', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          creatorType: 'skill'
        }
      }
    }
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.creatorType, 'skill');
});

test('isCreatorCompletion detects skill creation via subject pattern', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          subject: 'Create new skill for ripgrep'
        }
      }
    }
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.creatorType, 'skill');
});

test('isCreatorCompletion returns false for non-completed status', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'in_progress',
        metadata: {
          creatorType: 'skill'
        }
      }
    }
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

test('isCreatorCompletion returns false for non-creator tasks', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          subject: 'Fix bug in authentication'
        }
      }
    }
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

test('processCreatorCompletion writes to queue when gaps found', async () => {
  // Clean up queue
  if (fs.existsSync(QUEUE_PATH)) {
    fs.unlinkSync(QUEUE_PATH);
  }

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        taskId: '7',
        metadata: {
          creatorType: 'skill',
          artifactId: 'skill:test-skill'
        }
      }
    }
  };

  await processCreatorCompletion(hookData);

  // Verify queue file was created
  assert.ok(fs.existsSync(QUEUE_PATH));

  // Verify entry was written
  const content = fs.readFileSync(QUEUE_PATH, 'utf8');
  const lines = content.trim().split('\n');
  assert.ok(lines.length > 0);

  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.artifactId, 'skill:test-skill');
  assert.strictEqual(entry.creatorType, 'skill');
  assert.strictEqual(entry.processed, false);

  // Cleanup
  fs.unlinkSync(QUEUE_PATH);
});
