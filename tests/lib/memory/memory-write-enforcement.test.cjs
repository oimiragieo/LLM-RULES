const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  checkStructuredMemoryDirectWrite,
} = require('../../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('structured memory direct-write enforcement (S1-S5)', () => {
  function withEnforcement(value, fn) {
    const prev = process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT;
    if (value == null) {
      delete process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT;
    } else {
      process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT = value;
    }
    try {
      fn();
    } finally {
      if (prev == null) delete process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT;
      else process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT = prev;
    }
  }

  test('S1: blocks direct Write to patterns.json when enforcement=block', () => {
    withEnforcement('block', () => {
      const result = checkStructuredMemoryDirectWrite('Write', {
        file_path: '.claude/context/memory/patterns.json',
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /MemoryRecord/i);
    });
  });

  test('S2: blocks direct Write to gotchas.json when enforcement=block', () => {
    withEnforcement('block', () => {
      const result = checkStructuredMemoryDirectWrite('Write', {
        file_path: '.claude/context/memory/gotchas.json',
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /structured memory/i);
    });
  });

  test('S3: blocks direct Edit to access-stats/open-findings when enforcement=block', () => {
    withEnforcement('block', () => {
      const accessStatsResult = checkStructuredMemoryDirectWrite('Edit', {
        file_path: '.claude/context/memory/access-stats.json',
      });
      assert.equal(accessStatsResult.action, 'block');

      const openFindingsResult = checkStructuredMemoryDirectWrite('Edit', {
        file_path: '.claude/context/memory/open-findings.json',
      });
      assert.equal(openFindingsResult.action, 'block');
    });
  });

  test('S4: warns but allows direct write when enforcement=warn', () => {
    withEnforcement('warn', () => {
      const result = checkStructuredMemoryDirectWrite('Write', {
        file_path: '.claude/context/memory/patterns.json',
      });
      assert.equal(result.action, 'allow');
      assert.match(result.warning || '', /MemoryRecord/i);
    });
  });

  test('S5: allows writes outside structured memory and normalizes windows paths', () => {
    withEnforcement('block', () => {
      const nonMemoryResult = checkStructuredMemoryDirectWrite('Write', {
        file_path: 'README.md',
      });
      assert.equal(nonMemoryResult.action, 'allow');

      const windowsStyleMemoryResult = checkStructuredMemoryDirectWrite('Write', {
        file_path: 'C:\\dev\\projects\\agent-studio\\.claude\\context\\memory\\patterns.json',
      });
      assert.equal(windowsStyleMemoryResult.action, 'block');
    });
  });
});
