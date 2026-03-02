'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TARGETS = [
  '.claude/hooks/reflection/force-step0-execution.cjs',
  // reflection-step0-guard.cjs has its own readSpawnRequests (exported, tested separately)
  '.claude/hooks/reflection/reflection-queue-processor.cjs',
  '.claude/hooks/routing/user-prompt-unified.core.cjs',
];

test('reflection spawn-request readers use contract helper', () => {
  for (const rel of TARGETS) {
    const abs = path.join(process.cwd(), rel);
    const source = fs.readFileSync(abs, 'utf8');
    assert.match(source, /readSpawnRequestsFile/, `${rel} must use readSpawnRequestsFile`);
  }
});
