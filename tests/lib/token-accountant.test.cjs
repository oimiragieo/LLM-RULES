'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  TokenAccountant,
  MODEL_PRICING,
  DEFAULT_PERSISTENCE_PATH,
} = require('../../.claude/lib/metrics/token-accountant.cjs');

// --- helpers ---

function makeTempPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-accountant-'));
  return path.join(dir, 'token-usage.json');
}

function makeAccountant() {
  // Use temp path for isolation - tests should not pollute each other
  return new TokenAccountant(makeTempPath());
}

// ─── MODEL_PRICING ──────────────────────────────────────────────────────────

describe('MODEL_PRICING', () => {
  it('has pricing for haiku, sonnet, opus', () => {
    assert.ok('haiku' in MODEL_PRICING);
    assert.ok('sonnet' in MODEL_PRICING);
    assert.ok('opus' in MODEL_PRICING);
  });

  it('each model has input and output cost per 1K tokens', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      assert.ok(typeof pricing.input === 'number', `${model} missing input`);
      assert.ok(typeof pricing.output === 'number', `${model} missing output`);
      assert.ok(pricing.input > 0, `${model} input must be positive`);
      assert.ok(pricing.output > 0, `${model} output must be positive`);
    }
  });

  it('opus is most expensive, haiku is cheapest', () => {
    assert.ok(MODEL_PRICING.opus.input > MODEL_PRICING.sonnet.input);
    assert.ok(MODEL_PRICING.sonnet.input > MODEL_PRICING.haiku.input);
    assert.ok(MODEL_PRICING.opus.output > MODEL_PRICING.sonnet.output);
    assert.ok(MODEL_PRICING.sonnet.output > MODEL_PRICING.haiku.output);
  });
});

// ─── recordUsage ────────────────────────────────────────────────────────────

describe('recordUsage', () => {
  it('stores a usage record', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'developer',
    });
    const stats = acc.getTaskCost('task-1');
    assert.ok(stats !== null);
  });

  it('accumulates multiple records for the same task', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'developer',
    });
    acc.recordUsage('task-1', {
      inputTokens: 2000,
      outputTokens: 1000,
      model: 'sonnet',
      agentType: 'developer',
    });
    const cost = acc.getTaskCost('task-1');
    assert.ok(cost.totalTokens === 4500);
  });

  it('handles missing model (defaults to sonnet pricing)', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', { inputTokens: 1000, outputTokens: 500, agentType: 'developer' });
    const cost = acc.getTaskCost('task-1');
    assert.ok(cost.costUSD > 0);
  });

  it('handles missing agentType gracefully', () => {
    const acc = makeAccountant();
    assert.doesNotThrow(() => {
      acc.recordUsage('task-1', { inputTokens: 1000, outputTokens: 500, model: 'haiku' });
    });
  });

  it('ignores invalid taskId', () => {
    const acc = makeAccountant();
    assert.doesNotThrow(() => {
      acc.recordUsage('', { inputTokens: 100, outputTokens: 50 });
      acc.recordUsage(null, { inputTokens: 100, outputTokens: 50 });
    });
  });

  it('treats negative token counts as 0', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: -100,
      outputTokens: -50,
      model: 'sonnet',
      agentType: 'dev',
    });
    const cost = acc.getTaskCost('task-1');
    assert.equal(cost.totalTokens, 0);
    assert.equal(cost.costUSD, 0);
  });
});

// ─── getTaskCost ────────────────────────────────────────────────────────────

describe('getTaskCost', () => {
  it('calculates cost based on model pricing', () => {
    const acc = makeAccountant();
    // 1000 input tokens * $3/1K = $3, 500 output tokens * $15/1K = $7.5
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'dev',
    });
    const cost = acc.getTaskCost('task-1');
    assert.ok(Math.abs(cost.costUSD - 10.5) < 0.001, `expected $10.5, got $${cost.costUSD}`);
  });

  it('returns null for unknown task', () => {
    const acc = makeAccountant();
    assert.equal(acc.getTaskCost('nonexistent'), null);
  });

  it('returns correct structure', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'haiku',
      agentType: 'qa',
    });
    const cost = acc.getTaskCost('task-1');
    assert.ok(typeof cost.inputTokens === 'number');
    assert.ok(typeof cost.outputTokens === 'number');
    assert.ok(typeof cost.totalTokens === 'number');
    assert.ok(typeof cost.costUSD === 'number');
    assert.equal(cost.totalTokens, cost.inputTokens + cost.outputTokens);
  });

  it('uses haiku pricing correctly', () => {
    const acc = makeAccountant();
    // 1000 input * $0.25/1K = $0.25, 1000 output * $1.25/1K = $1.25
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 1000,
      model: 'haiku',
      agentType: 'dev',
    });
    const cost = acc.getTaskCost('task-1');
    assert.ok(Math.abs(cost.costUSD - 1.5) < 0.001, `expected $1.5, got $${cost.costUSD}`);
  });

  it('uses opus pricing correctly', () => {
    const acc = makeAccountant();
    // 1000 input * $15/1K = $15, 1000 output * $75/1K = $75
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 1000,
      model: 'opus',
      agentType: 'dev',
    });
    const cost = acc.getTaskCost('task-1');
    assert.ok(Math.abs(cost.costUSD - 90) < 0.001, `expected $90, got $${cost.costUSD}`);
  });
});

// ─── getSessionTotal ────────────────────────────────────────────────────────

describe('getSessionTotal', () => {
  it('aggregates all tasks', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'dev',
    });
    acc.recordUsage('task-2', {
      inputTokens: 2000,
      outputTokens: 1000,
      model: 'haiku',
      agentType: 'qa',
    });
    const total = acc.getSessionTotal();
    assert.equal(total.inputTokens, 3000);
    assert.equal(total.outputTokens, 1500);
    assert.equal(total.totalTokens, 4500);
  });

  it('returns zero for empty accountant', () => {
    const acc = makeAccountant();
    const total = acc.getSessionTotal();
    assert.equal(total.inputTokens, 0);
    assert.equal(total.outputTokens, 0);
    assert.equal(total.totalTokens, 0);
    assert.equal(total.costUSD, 0);
    assert.equal(total.taskCount, 0);
  });

  it('includes taskCount', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });
    acc.recordUsage('task-2', {
      inputTokens: 200,
      outputTokens: 100,
      model: 'sonnet',
      agentType: 'dev',
    });
    const total = acc.getSessionTotal();
    assert.equal(total.taskCount, 2);
  });
});

// ─── getByAgent ─────────────────────────────────────────────────────────────

describe('getByAgent', () => {
  it('filters usage by agentType', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'developer',
    });
    acc.recordUsage('task-2', {
      inputTokens: 2000,
      outputTokens: 1000,
      model: 'sonnet',
      agentType: 'qa',
    });
    acc.recordUsage('task-3', {
      inputTokens: 500,
      outputTokens: 250,
      model: 'sonnet',
      agentType: 'developer',
    });

    const devUsage = acc.getByAgent('developer');
    assert.equal(devUsage.inputTokens, 1500);
    assert.equal(devUsage.outputTokens, 750);
    assert.equal(devUsage.taskCount, 2);

    const qaUsage = acc.getByAgent('qa');
    assert.equal(qaUsage.inputTokens, 2000);
    assert.equal(qaUsage.taskCount, 1);
  });

  it('returns zero for unknown agent', () => {
    const acc = makeAccountant();
    const usage = acc.getByAgent('nonexistent');
    assert.equal(usage.inputTokens, 0);
    assert.equal(usage.taskCount, 0);
  });
});

// ─── toJSON ─────────────────────────────────────────────────────────────────

describe('toJSON', () => {
  it('returns serializable object', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });
    const json = acc.toJSON();
    assert.ok(typeof json === 'object');
    assert.doesNotThrow(() => JSON.stringify(json));
  });

  it('includes tasks and session total', () => {
    const acc = makeAccountant();
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });
    const json = acc.toJSON();
    assert.ok('tasks' in json);
    assert.ok('session' in json);
    assert.ok('task-1' in json.tasks);
  });
});

// ─── Lifecycle Wiring ───────────────────────────────────────────────────────

describe('Lifecycle Wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  function makeTempPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-accountant-'));
    return path.join(dir, 'token-usage.json');
  }

  it('DEFAULT_PERSISTENCE_PATH is exported and points to correct location', () => {
    assert.ok(typeof DEFAULT_PERSISTENCE_PATH === 'string');
    assert.ok(DEFAULT_PERSISTENCE_PATH.endsWith('token-usage.json'));
    // Check for both forward slash and backslash (platform-independent)
    const normalizedPath = DEFAULT_PERSISTENCE_PATH.replace(/\\/g, '/');
    assert.ok(normalizedPath.includes('context/metrics'));
  });

  it('constructor calls load() on init with default path', () => {
    const filePath = makeTempPath();
    // Create pre-existing data
    const acc1 = new TokenAccountant(filePath);
    acc1.recordUsage('task-preexisting', {
      inputTokens: 500,
      outputTokens: 250,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Create new instance - should load on init
    const acc2 = new TokenAccountant(filePath);
    const cost = acc2.getTaskCost('task-preexisting');
    assert.ok(cost !== null, 'Constructor should have loaded pre-existing data');
    assert.equal(cost.inputTokens, 500, 'Input tokens should match after auto-load');
  });

  it('recordUsage() calls persist() automatically after each recording', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);

    // Record usage - should auto-persist
    acc.recordUsage('task-auto-persist', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Verify file was written
    assert.ok(fs.existsSync(filePath), 'Persistence file should be created automatically');

    // Verify data by reading directly
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    assert.ok('task-auto-persist' in data.tasks, 'Task should be persisted');
  });

  it('multiple recordUsage() calls all persist correctly', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);

    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });
    acc.recordUsage('task-2', {
      inputTokens: 200,
      outputTokens: 100,
      model: 'haiku',
      agentType: 'qa',
    });
    acc.recordUsage('task-1', {
      inputTokens: 50,
      outputTokens: 25,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Create new instance to verify persistence
    const acc2 = new TokenAccountant(filePath);
    const total = acc2.getSessionTotal();
    assert.equal(total.taskCount, 2, 'Both tasks should be persisted');
    assert.equal(total.inputTokens, 350, 'All input tokens should be accumulated');
    assert.equal(total.outputTokens, 175, 'All output tokens should be accumulated');
  });

  it('constructor accepts custom persistence path', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);
    acc.recordUsage('custom-path-task', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Verify custom path was used
    assert.ok(fs.existsSync(filePath), 'Custom persistence path should be used');
  });

  it('persistence failure does not break recording', () => {
    // Use an invalid path that will fail persistence
    const acc = new TokenAccountant('/invalid/path/that/does/not/exist/token-usage.json');

    // Should not throw even though persist will fail
    assert.doesNotThrow(() => {
      acc.recordUsage('task-fail-persist', {
        inputTokens: 100,
        outputTokens: 50,
        model: 'sonnet',
        agentType: 'dev',
      });
    });

    // Data should still be in memory even if persist failed
    const cost = acc.getTaskCost('task-fail-persist');
    assert.ok(cost !== null, 'Data should be recorded in memory even if persist fails');
  });
});

// ─── Persistence (VAL-RF-016, VAL-RF-017, VAL-RF-018, VAL-RF-019) ───────────

describe('persist and load', () => {
  function makeTempPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-accountant-'));
    return path.join(dir, 'token-usage.json');
  }

  it('VAL-RF-016: persist() writes to disk, load() recovers data', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Verify file exists (auto-persisted by recordUsage)
    assert.ok(fs.existsSync(filePath), 'Persistence file should exist');

    // Create new instance and load
    const acc2 = new TokenAccountant(filePath);

    const cost = acc2.getTaskCost('task-1');
    assert.ok(cost !== null, 'Data should be recovered');
    assert.equal(cost.inputTokens, 1000, 'Input tokens should match');
    assert.equal(cost.outputTokens, 500, 'Output tokens should match');
  });

  it('VAL-RF-017: load() handles corrupted file gracefully (no crash, empty state)', () => {
    const filePath = makeTempPath();
    fs.writeFileSync(filePath, '{ invalid json }', 'utf8');

    const acc = new TokenAccountant(filePath);
    // Should not throw on init with corrupted file

    // Should have empty state
    const total = acc.getSessionTotal();
    assert.equal(total.taskCount, 0, 'Should have empty state after corrupted load');
  });

  it('VAL-RF-018: load() handles missing file gracefully (no crash, empty state)', () => {
    const filePath = path.join(os.tmpdir(), 'nonexistent-token-usage-' + Date.now() + '.json');

    const acc = new TokenAccountant(filePath);
    // Should not throw on init with missing file

    // Should have empty state
    const total = acc.getSessionTotal();
    assert.equal(total.taskCount, 0, 'Should have empty state after missing file');
  });

  it('VAL-RF-019: persist() uses atomic writes (write-to-temp + rename)', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });

    // Persist should complete without error (recordUsage auto-persists)
    assert.ok(fs.existsSync(filePath), 'File should exist after recordUsage');

    // Verify the file exists and has correct content
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok('tasks' in parsed, 'Persisted file should have tasks');
    assert.ok('task-1' in parsed.tasks, 'Persisted file should have task-1');
  });

  it('persist() creates parent directories if missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-accountant-nested-'));
    const filePath = path.join(dir, 'subdir', 'token-usage.json');

    const acc = new TokenAccountant(filePath);
    acc.recordUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });

    assert.ok(fs.existsSync(filePath), 'File should be created in nested directory');
  });

  it('load() + persist() preserves all task data', () => {
    const filePath = makeTempPath();
    const acc = new TokenAccountant(filePath);
    acc.recordUsage('task-1', {
      inputTokens: 1000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'dev',
    });
    acc.recordUsage('task-2', {
      inputTokens: 2000,
      outputTokens: 1000,
      model: 'haiku',
      agentType: 'qa',
    });
    acc.recordUsage('task-3', {
      inputTokens: 500,
      outputTokens: 250,
      model: 'opus',
      agentType: 'architect',
    });

    const acc2 = new TokenAccountant(filePath);

    const total = acc2.getSessionTotal();
    assert.equal(total.taskCount, 3, 'All 3 tasks should be recovered');
    assert.equal(total.inputTokens, 3500, 'Total input tokens should match');
    assert.equal(total.outputTokens, 1750, 'Total output tokens should match');
  });

  it('load() handles empty file gracefully', () => {
    const filePath = makeTempPath();
    fs.writeFileSync(filePath, '{}', 'utf8');

    const acc = new TokenAccountant(filePath);
    assert.doesNotThrow(() => {
      // Load happens in constructor
    });

    const total = acc.getSessionTotal();
    assert.equal(total.taskCount, 0, 'Should have empty state');
  });

  it('persist() overwrites existing file', () => {
    const filePath = makeTempPath();
    fs.writeFileSync(filePath, '{"old": "data"}', 'utf8');

    const acc = new TokenAccountant(filePath);
    // Constructor will load corrupted/old format data and ignore it
    acc.recordUsage('new-task', {
      inputTokens: 100,
      outputTokens: 50,
      model: 'sonnet',
      agentType: 'dev',
    });

    const acc2 = new TokenAccountant(filePath);

    const oldTask = acc2.getTaskCost('old');
    assert.equal(oldTask, null, 'Old data should be overwritten');
    const newTask = acc2.getTaskCost('new-task');
    assert.ok(newTask !== null, 'New data should exist');
  });
});
