'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  appendObservation,
  readObservations,
  scoreObservations,
  getByTopic,
  compactObservationsToSummary,
  recordMemoryBlockChurn,
  MEMORY_CACHE_STABILITY_FILE,
} = require('../../../.claude/lib/memory/observations.cjs');

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'observations-test-'));
}

function getObservationsPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'observations.jsonl');
}

function getObservationsSummaryPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'observations_summary.md');
}

function getMemoryCacheStabilityPath(projectRoot) {
  return path.join(projectRoot, MEMORY_CACHE_STABILITY_FILE);
}

function cleanup(projectRoot) {
  if (projectRoot && fs.existsSync(projectRoot)) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function withEnv(envMap, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(envMap)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('appendObservation writes one JSON line and creates directory/file if missing', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const record = {
      timestamp: new Date().toISOString(),
      topic: 'routing',
      fact: 'Router enforces task list first.',
      confidence: 0.9,
      source_session: 'session-a',
    };

    appendObservation(projectRoot, record);

    const observationsPath = getObservationsPath(projectRoot);
    assert.equal(fs.existsSync(observationsPath), true);
    const lines = fs.readFileSync(observationsPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.topic, 'routing');
    assert.equal(parsed.fact, 'Router enforces task list first.');
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation handles parallel appends without corrupting lines', async () => {
  const projectRoot = createTempProjectRoot();
  try {
    const timestamp = new Date().toISOString();
    const jobs = Array.from({ length: 10 }).map((_, idx) =>
      Promise.resolve().then(() =>
        appendObservation(projectRoot, {
          timestamp,
          topic: 'memory',
          fact: `fact-${idx}`,
          confidence: 0.8,
          source_session: `session-${idx}`,
        })
      )
    );

    await Promise.all(jobs);

    const observationsPath = getObservationsPath(projectRoot);
    const lines = fs.readFileSync(observationsPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 10);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.equal(typeof parsed.topic, 'string');
      assert.equal(typeof parsed.fact, 'string');
      assert.equal(typeof parsed.source_session, 'string');
    }
  } finally {
    cleanup(projectRoot);
  }
});

test('readObservations returns [] for missing files, skips malformed lines, and honors limit', () => {
  const projectRoot = createTempProjectRoot();
  try {
    assert.deepEqual(readObservations(projectRoot, { limit: 10 }), []);

    const observationsPath = getObservationsPath(projectRoot);
    fs.mkdirSync(path.dirname(observationsPath), { recursive: true });
    fs.writeFileSync(
      observationsPath,
      [
        JSON.stringify({
          timestamp: '2026-02-10T00:00:00.000Z',
          topic: 'routing',
          fact: 'a',
          confidence: 0.9,
          source_session: 's1',
        }),
        '{ malformed json',
        JSON.stringify({
          timestamp: '2026-02-11T00:00:00.000Z',
          topic: 'routing',
          fact: 'b',
          confidence: 0.9,
          source_session: 's2',
        }),
        JSON.stringify({
          timestamp: '2026-02-12T00:00:00.000Z',
          topic: 'memory',
          fact: 'c',
          confidence: 0.9,
          source_session: 's3',
        }),
        '',
      ].join('\n'),
      'utf8'
    );

    const rows = readObservations(projectRoot, { limit: 2 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].fact, 'b');
    assert.equal(rows[1].fact, 'c');
  } finally {
    cleanup(projectRoot);
  }
});

test('getByTopic returns most recent observations for a topic with limit', () => {
  const projectRoot = createTempProjectRoot();
  try {
    appendObservation(projectRoot, {
      timestamp: '2026-02-10T00:00:00.000Z',
      topic: 'auth',
      fact: 'old auth fact',
      confidence: 0.8,
      source_session: 's1',
    });
    appendObservation(projectRoot, {
      timestamp: '2026-02-11T00:00:00.000Z',
      topic: 'routing',
      fact: 'routing fact',
      confidence: 0.8,
      source_session: 's2',
    });
    appendObservation(projectRoot, {
      timestamp: '2026-02-12T00:00:00.000Z',
      topic: 'auth',
      fact: 'new auth fact',
      confidence: 0.8,
      source_session: 's3',
    });

    const rows = getByTopic(projectRoot, 'auth', { limit: 1 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].fact, 'new auth fact');
  } finally {
    cleanup(projectRoot);
  }
});

test('compactObservationsToSummary writes stable summary markdown from latest observations', () => {
  const projectRoot = createTempProjectRoot();
  try {
    appendObservation(projectRoot, {
      timestamp: '2026-02-10T00:00:00.000Z',
      topic: 'auth',
      fact: 'Use token refresh for long sessions.',
      confidence: 0.8,
      source_session: 's1',
    });
    appendObservation(projectRoot, {
      timestamp: '2026-02-11T00:00:00.000Z',
      topic: 'routing',
      fact: 'Prefer Task updates before spawning specialists.',
      confidence: 0.9,
      source_session: 's2',
    });
    appendObservation(projectRoot, {
      timestamp: '2026-02-12T00:00:00.000Z',
      topic: 'auth',
      fact: 'Rotate keys quarterly.',
      confidence: 0.95,
      source_session: 's3',
    });

    const result = compactObservationsToSummary(projectRoot, { maxObservations: 2 });
    const summaryPath = getObservationsSummaryPath(projectRoot);
    const summary = fs.readFileSync(summaryPath, 'utf8');

    assert.equal(fs.existsSync(summaryPath), true);
    assert.equal(typeof result.summary, 'string');
    assert.match(summary, /## Observational summary/i);
    assert.match(summary, /auth/i);
    assert.match(summary, /routing/i);
    assert.equal(result.count, 2);
  } finally {
    cleanup(projectRoot);
  }
});

test('scoreObservations ranks by confidence and recency with decay', () => {
  const now = Date.parse('2026-02-12T12:00:00.000Z');
  const rows = [
    {
      timestamp: '2026-02-12T11:00:00.000Z',
      topic: 'routing',
      fact: 'recent mid confidence',
      confidence: 0.8,
      source_session: 's1',
    },
    {
      timestamp: '2026-02-12T11:30:00.000Z',
      topic: 'memory',
      fact: 'recent high confidence',
      confidence: 0.95,
      source_session: 's2',
    },
    {
      timestamp: '2026-02-10T11:30:00.000Z',
      topic: 'memory',
      fact: 'old high confidence',
      confidence: 0.95,
      source_session: 's3',
    },
  ];

  const scored = scoreObservations(rows, { nowMs: now, decayPerHour: 0.1 });
  assert.equal(scored.length, 3);
  assert.equal(scored[0].fact, 'recent high confidence');
  assert.equal(scored[2].fact, 'old high confidence');
  assert.equal(typeof scored[0].score, 'number');
  assert.equal(typeof scored[0].recency_factor, 'number');
});

test('recordMemoryBlockChurn appends hash metrics with churned true/false', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const metricsPath = getMemoryCacheStabilityPath(projectRoot);

    const first = recordMemoryBlockChurn(projectRoot, 'section-a');
    const second = recordMemoryBlockChurn(projectRoot, 'section-a');
    const third = recordMemoryBlockChurn(projectRoot, 'section-b');

    assert.equal(fs.existsSync(metricsPath), true);
    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 3);

    assert.equal(first.churned, false);
    assert.equal(second.churned, false);
    assert.equal(third.churned, true);
    assert.equal(second.previous_hash, first.memory_block_hash);
    assert.equal(third.previous_hash, second.memory_block_hash);
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation marks supersedes when a new fact contradicts same-topic recent fact', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const appended = withEnv({ OBSERVATIONS_CONTRADICTION_ENABLED: 'on' }, () => {
      appendObservation(projectRoot, {
        timestamp: '2026-02-10T00:00:00.000Z',
        topic: 'auth',
        fact: 'Use JWT bearer tokens for API auth.',
        confidence: 0.8,
        source_session: 's1',
      });

      return appendObservation(projectRoot, {
        timestamp: '2026-02-12T00:00:00.000Z',
        topic: 'auth',
        fact: 'No longer use JWT bearer tokens; replaced by opaque session tokens.',
        confidence: 0.9,
        source_session: 's2',
      });
    });

    assert.equal(typeof appended.supersedes, 'string');
    assert.equal(appended.supersedes, '2026-02-10T00:00:00.000Z');
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation does not set supersedes without contradiction cues', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const appended = withEnv({ OBSERVATIONS_CONTRADICTION_ENABLED: 'on' }, () => {
      appendObservation(projectRoot, {
        timestamp: '2026-02-10T00:00:00.000Z',
        topic: 'auth',
        fact: 'Use JWT bearer tokens for API auth.',
        confidence: 0.8,
        source_session: 's1',
      });

      return appendObservation(projectRoot, {
        timestamp: '2026-02-12T00:00:00.000Z',
        topic: 'auth',
        fact: 'Use JWT bearer tokens with issuer validation.',
        confidence: 0.9,
        source_session: 's2',
      });
    });

    assert.equal(appended.supersedes, undefined);
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation does not set supersedes for stale historical observations', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const appended = withEnv({ OBSERVATIONS_CONTRADICTION_ENABLED: 'on' }, () => {
      appendObservation(projectRoot, {
        timestamp: '2025-01-01T00:00:00.000Z',
        topic: 'auth',
        fact: 'Use JWT bearer tokens for API auth.',
        confidence: 0.8,
        source_session: 's1',
      });

      return appendObservation(projectRoot, {
        timestamp: '2026-02-12T00:00:00.000Z',
        topic: 'auth',
        fact: 'No longer use JWT bearer tokens; replaced by opaque session tokens.',
        confidence: 0.9,
        source_session: 's2',
      });
    });

    assert.equal(appended.supersedes, undefined);
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation leaves supersedes unset by default when contradiction feature is disabled', () => {
  const projectRoot = createTempProjectRoot();
  try {
    appendObservation(projectRoot, {
      timestamp: '2026-02-10T00:00:00.000Z',
      topic: 'auth',
      fact: 'Use JWT bearer tokens for API auth.',
      confidence: 0.8,
      source_session: 's1',
    });

    const appended = appendObservation(projectRoot, {
      timestamp: '2026-02-12T00:00:00.000Z',
      topic: 'auth',
      fact: 'No longer use JWT bearer tokens; replaced by opaque session tokens.',
      confidence: 0.9,
      source_session: 's2',
    });

    assert.equal(appended.supersedes, undefined);
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation clamps future timestamps to now', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const futureTs = new Date(Date.now() + 999999999).toISOString();
    const beforeNow = Date.now();
    const appended = appendObservation(projectRoot, {
      timestamp: futureTs,
      topic: 'routing',
      fact: 'Some fact with a future timestamp.',
      confidence: 0.9,
      source_session: 'session-future',
    });
    const afterNow = Date.now();

    const storedTs = Date.parse(appended.timestamp);
    assert.equal(storedTs <= afterNow, true, 'timestamp should be <= now after clamping');
    assert.equal(storedTs >= beforeNow, true, 'timestamp should be >= before-call time');
    assert.notEqual(
      appended.timestamp,
      futureTs,
      'stored timestamp must differ from the original future timestamp'
    );
  } finally {
    cleanup(projectRoot);
  }
});

test('appendObservation preserves timestamps within 5 second grace period', () => {
  const projectRoot = createTempProjectRoot();
  try {
    const nearFutureTs = new Date(Date.now() + 1000).toISOString();
    const appended = appendObservation(projectRoot, {
      timestamp: nearFutureTs,
      topic: 'routing',
      fact: 'Slightly future timestamp within grace period.',
      confidence: 0.9,
      source_session: 'session-nearf',
    });

    assert.equal(
      appended.timestamp,
      nearFutureTs,
      'near-future timestamp within grace should be preserved'
    );
  } finally {
    cleanup(projectRoot);
  }
});
