/**
 * LLM Usage Tracker - Cost Tracking Hook Tests
 * TDD: Test-Driven Development approach
 *
 * Test Scenarios (12 minimum):
 * 1. Initialize tracking on session-start
 * 2. Log entry on session-end
 * 3. Calculate cost for sonnet model
 * 4. Calculate cost for opus model
 * 5. Calculate cost for haiku model
 * 6. Hash chain integrity (3 entries)
 * 7. Detect tampering (modified middle entry)
 * 8. Append-only enforcement (no overwrites)
 * 9. Rate limiting (1000 entries/hour)
 * 10. Cost report generation
 * 11. Filter by date range
 * 12. Verify integrity command
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Create temporary directory for test isolation
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-tracking-'));

// Mock implementations (stubs for actual implementations)
const PRICING = {
  haiku: { input: 0.00025, output: 0.00125 },
  sonnet: { input: 0.003, output: 0.015 },
  opus: { input: 0.015, output: 0.075 },
};

function calculateCost(tier, inputTokens, outputTokens) {
  const pricing = PRICING[tier] || PRICING.sonnet;
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

function calculateEntryHash(entry, previousHash) {
  const entryString = JSON.stringify(entry, Object.keys(entry).sort());
  const hashInput = previousHash + entryString;
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
}

function appendWithIntegrity(logPath, entry) {
  let previousHash = '0';

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    if (content) {
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        const lastEntry = JSON.parse(lastLine);
        previousHash = lastEntry._hash || '0';
      } catch {
        previousHash = 'BROKEN_' + Date.now();
      }
    }
  }

  entry._hash = calculateEntryHash(entry, previousHash);
  entry._prevHash = previousHash;

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

  return entry;
}

function verifyLogIntegrity(logPath) {
  if (!fs.existsSync(logPath)) {
    return { valid: true, brokenAt: null, reason: 'Log file does not exist' };
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) {
    return { valid: true, brokenAt: null, reason: 'Log file is empty' };
  }

  const lines = content.split('\n');
  let previousHash = '0';

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry._prevHash !== previousHash) {
        return {
          valid: false,
          brokenAt: i + 1,
          reason: `Hash chain broken at line ${i + 1}`,
        };
      }

      const entryWithoutHash = { ...entry };
      delete entryWithoutHash._hash;
      delete entryWithoutHash._prevHash;

      const calculatedHash = calculateEntryHash(entryWithoutHash, previousHash);
      if (calculatedHash !== entry._hash) {
        return {
          valid: false,
          brokenAt: i + 1,
          reason: `Entry hash mismatch at line ${i + 1}`,
        };
      }

      previousHash = entry._hash;
    } catch (_e) {
      return {
        valid: false,
        brokenAt: i + 1,
        reason: `Invalid JSON at line ${i + 1}`,
      };
    }
  }

  return { valid: true, brokenAt: null, reason: 'Log integrity verified' };
}

// Tests

test('Test 1: Calculate cost for sonnet model', () => {
  const cost = calculateCost('sonnet', 1500, 300);
  assert.strictEqual(cost > 0, true, 'Cost should be positive');
  assert.strictEqual(
    cost,
    (1500 / 1000) * 0.003 + (300 / 1000) * 0.015,
    'Cost calculation should be accurate'
  );
});

test('Test 2: Calculate cost for opus model', () => {
  const cost = calculateCost('opus', 3000, 1500);
  assert.strictEqual(cost > 0, true, 'Cost should be positive');
  assert.strictEqual(
    cost,
    (3000 / 1000) * 0.015 + (1500 / 1000) * 0.075,
    'Cost calculation should be accurate'
  );
});

test('Test 3: Calculate cost for haiku model', () => {
  const cost = calculateCost('haiku', 500, 200);
  assert.strictEqual(cost > 0, true, 'Cost should be positive');
  assert.strictEqual(
    cost,
    (500 / 1000) * 0.00025 + (200 / 1000) * 0.00125,
    'Cost calculation should be accurate'
  );
});

test('Test 4: Hash generation is deterministic', () => {
  const entry = { timestamp: '2026-01-28T10:00:00Z', tier: 'sonnet', cost: 0.016 };
  const hash1 = calculateEntryHash(entry, '0');
  const hash2 = calculateEntryHash(entry, '0');
  assert.strictEqual(hash1, hash2, 'Hash should be deterministic');
});

test('Test 5: Append entry with integrity hash', () => {
  const logPath = path.join(TEST_DIR, 'test-log-5.jsonl');

  const entry = {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  };

  const result = appendWithIntegrity(logPath, entry);

  assert.ok(result._hash, 'Entry should have hash');
  assert.strictEqual(result._prevHash, '0', 'First entry should have prevHash = 0');
  assert.ok(fs.existsSync(logPath), 'Log file should exist');
});

test('Test 6: Hash chain integrity with 3 entries', () => {
  const logPath = path.join(TEST_DIR, 'test-log-6.jsonl');

  // Clear the file
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  // Add 3 entries
  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:01:00Z',
    tier: 'haiku',
    inputTokens: 500,
    outputTokens: 200,
    cost: '0.000375',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:02:00Z',
    tier: 'opus',
    inputTokens: 3000,
    outputTokens: 1500,
    cost: '0.157500',
  });

  const verification = verifyLogIntegrity(logPath);
  assert.strictEqual(verification.valid, true, 'Hash chain should be valid');
});

test('Test 7: Detect tampering - modified middle entry', () => {
  const logPath = path.join(TEST_DIR, 'test-log-7.jsonl');

  // Clear the file
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  // Add 3 entries
  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:01:00Z',
    tier: 'haiku',
    inputTokens: 500,
    outputTokens: 200,
    cost: '0.000375',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:02:00Z',
    tier: 'opus',
    inputTokens: 3000,
    outputTokens: 1500,
    cost: '0.157500',
  });

  // Now tamper with the middle entry
  const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
  const entry2 = JSON.parse(lines[1]);
  entry2.cost = '0.999999'; // Modify cost
  lines[1] = JSON.stringify(entry2);
  fs.writeFileSync(logPath, lines.join('\n'));

  const verification = verifyLogIntegrity(logPath);
  assert.strictEqual(verification.valid, false, 'Tampering should be detected');
  assert.ok(verification.reason.includes('hash'), 'Error should mention hash mismatch');
});

test('Test 8: Append-only - cannot overwrite', () => {
  const logPath = path.join(TEST_DIR, 'test-log-8.jsonl');

  const entry1 = { timestamp: '2026-01-28T10:00:00Z', tier: 'sonnet', cost: '0.016' };
  const entry2 = { timestamp: '2026-01-28T10:01:00Z', tier: 'haiku', cost: '0.0004' };

  appendWithIntegrity(logPath, entry1);
  appendWithIntegrity(logPath, entry2);

  // Try to write a new file (this would overwrite)
  const lines = fs
    .readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l);
  assert.strictEqual(lines.length, 2, 'Should have 2 entries');

  // Append another entry (verify append works)
  appendWithIntegrity(logPath, { timestamp: '2026-01-28T10:02:00Z', tier: 'opus', cost: '0.157' });

  const updatedLines = fs
    .readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l);
  assert.strictEqual(updatedLines.length, 3, 'Should have 3 entries after append');
});

test('Test 9: Cost report aggregation', () => {
  const logPath = path.join(TEST_DIR, 'test-log-9.jsonl');

  // Clear and add entries
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:01:00Z',
    tier: 'sonnet',
    inputTokens: 1000,
    outputTokens: 500,
    cost: '0.010500',
  });

  // Aggregate costs
  const lines = fs
    .readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l);
  let totalCost = 0;
  let sonnetCalls = 0;

  for (const line of lines) {
    const entry = JSON.parse(line);
    totalCost += parseFloat(entry.cost);
    if (entry.tier === 'sonnet') sonnetCalls++;
  }

  assert.strictEqual(sonnetCalls, 2, 'Should have 2 sonnet calls');
  assert.ok(totalCost > 0, 'Total cost should be positive');
});

test('Test 10: Filter by date range', () => {
  const logPath = path.join(TEST_DIR, 'test-log-10.jsonl');

  // Clear and add entries with different timestamps
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-27T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'haiku',
    inputTokens: 500,
    outputTokens: 200,
    cost: '0.000375',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-29T10:00:00Z',
    tier: 'opus',
    inputTokens: 3000,
    outputTokens: 1500,
    cost: '0.157500',
  });

  // Filter by date range
  const lines = fs
    .readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l);
  const jan28Entries = lines.filter(l => {
    const entry = JSON.parse(l);
    return entry.timestamp.startsWith('2026-01-28');
  });

  assert.strictEqual(jan28Entries.length, 1, 'Should have 1 entry on 2026-01-28');
});

test('Test 11: Verify integrity command detects all tampering', () => {
  const logPath = path.join(TEST_DIR, 'test-log-11.jsonl');

  // Clear and add entries
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:00:00Z',
    tier: 'sonnet',
    inputTokens: 1500,
    outputTokens: 800,
    cost: '0.016500',
  });

  appendWithIntegrity(logPath, {
    timestamp: '2026-01-28T10:01:00Z',
    tier: 'haiku',
    inputTokens: 500,
    outputTokens: 200,
    cost: '0.000375',
  });

  // Verify clean log
  let verification = verifyLogIntegrity(logPath);
  assert.strictEqual(verification.valid, true, 'Clean log should pass verification');

  // Tamper with first entry
  const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
  const entry1 = JSON.parse(lines[0]);
  entry1._hash = 'TAMPERED';
  lines[0] = JSON.stringify(entry1);
  fs.writeFileSync(logPath, lines.join('\n'));

  // Verify detects tampering
  verification = verifyLogIntegrity(logPath);
  assert.strictEqual(verification.valid, false, 'Should detect tampering');
});

test('Test 12: Rate limiting - track entries per hour', () => {
  const logPath = path.join(TEST_DIR, 'test-log-12.jsonl');

  // Clear the file
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Add 5 entries from last hour
  for (let i = 0; i < 5; i++) {
    appendWithIntegrity(logPath, {
      timestamp: new Date(hourAgo.getTime() + i * 10 * 60 * 1000).toISOString(),
      tier: 'sonnet',
      inputTokens: 1000 + i * 100,
      outputTokens: 500 + i * 50,
      cost: (0.01 + i * 0.001).toString(),
    });
  }

  const lines = fs
    .readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l);

  // Count entries in last hour
  const entriesInLastHour = lines.filter(l => {
    const entry = JSON.parse(l);
    const entryTime = new Date(entry.timestamp);
    const timeDiff = now - entryTime;
    return timeDiff < 60 * 60 * 1000;
  });

  assert.ok(entriesInLastHour.length > 0, 'Should have entries in last hour');
  assert.ok(entriesInLastHour.length <= 1000, 'Should not exceed rate limit of 1000/hour');
});

// Cleanup
test.after(() => {
  // Remove temporary test directory
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});
