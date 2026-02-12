'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  appendObservation,
  readObservations,
  getByTopic,
} = require('../../../.claude/lib/memory/observations.cjs');

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'observations-test-'));
}

function getObservationsPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'observations.jsonl');
}

function cleanup(projectRoot) {
  if (projectRoot && fs.existsSync(projectRoot)) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
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
    const lines = fs
      .readFileSync(observationsPath, 'utf8')
      .split('\n')
      .filter(Boolean);
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
    const lines = fs
      .readFileSync(observationsPath, 'utf8')
      .split('\n')
      .filter(Boolean);
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
