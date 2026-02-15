#!/usr/bin/env node
'use strict';

const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const memoryManagerPath = path.join(projectRoot, '.claude', 'lib', 'memory', 'memory-manager.cjs');

try {
  const memoryManager = require(memoryManagerPath);
  memoryManager.searchMemory = async function searchMemoryStub() {
    return [
      {
        source: 'stub',
        similarity: 0.99,
        content: 'RAG_E2E_SENTINEL_USE_CANONICAL_TASKUPDATE_FLOW',
        metadata: { source: 'test-stub' },
      },
    ];
  };
} catch (_err) {
  // Best-effort preload; tests will fail with clear assertions if patching did not apply.
}

