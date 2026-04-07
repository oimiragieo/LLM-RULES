#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isCreatorCompletion,
  quickIntegrationCheck,
  extractArtifactId,
} = require('./post-creation-integration.cjs');

// Edge Case 1: Hook gracefully degrades when graph file is missing
test('quickIntegrationCheck returns graph-unavailable when graph missing', () => {
  const result = quickIntegrationCheck('skill:test', '/nonexistent/path/to/graph.json');
  assert.strictEqual(result.status, 'unknown');
  assert.ok(result.gaps.includes('graph-unavailable'));
});

// Edge Case 2: Hook handles all creator types
test('isCreatorCompletion detects all creator types', () => {
  const types = ['skill', 'agent', 'hook', 'workflow', 'template', 'schema'];

  for (const type of types) {
    const input = {
      toolUse: {
        tool: 'TaskUpdate',
        input: {
          status: 'completed',
          metadata: {
            subject: `Create new ${type} for testing`,
          },
        },
      },
    };

    const result = isCreatorCompletion(input);
    assert.strictEqual(result.match, true, `Should detect ${type} creation`);
    assert.strictEqual(result.creatorType, type, `Should identify ${type} type`);
  }
});

// Edge Case 3: Hook detects skill-creator pattern
test('isCreatorCompletion detects skill-creator in subject', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          subject: 'Invoke skill-creator to add ripgrep skill',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.creatorType, 'unknown');
});

// Edge Case 4: extractArtifactId handles missing metadata gracefully
test('extractArtifactId constructs ID when metadata missing', () => {
  const hookData = {
    toolUse: {
      input: {
        metadata: {}, // No artifactId or artifactName
      },
    },
  };

  const result = extractArtifactId(hookData, 'skill');
  assert.strictEqual(result, 'skill:unknown');
});

// Edge Case 5: extractArtifactId uses explicit artifactId when present
test('extractArtifactId prefers explicit artifactId', () => {
  const hookData = {
    toolUse: {
      input: {
        metadata: {
          artifactId: 'skill:explicit-id',
          artifactName: 'should-not-use-this',
        },
      },
    },
  };

  const result = extractArtifactId(hookData, 'skill');
  assert.strictEqual(result, 'skill:explicit-id');
});

// Edge Case 6: Hook handles non-TaskUpdate tools
test('processCreatorCompletion passes through non-TaskUpdate tools', async () => {
  const { processCreatorCompletion } = require('./post-creation-integration.cjs');

  const hookData = {
    toolUse: {
      tool: 'TaskCreate', // Not TaskUpdate
      input: {
        status: 'completed',
      },
    },
  };

  const result = await processCreatorCompletion(hookData);
  assert.strictEqual(result.result.allow, true);
});

// Edge Case 7: Hook handles in_progress status
test('isCreatorCompletion ignores in_progress tasks', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'in_progress',
        metadata: {
          creatorType: 'skill',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

// Edge Case 8: Hook handles blocked status
test('isCreatorCompletion ignores blocked tasks', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'blocked',
        metadata: {
          creatorType: 'skill',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

console.log('All edge case tests passed!');
