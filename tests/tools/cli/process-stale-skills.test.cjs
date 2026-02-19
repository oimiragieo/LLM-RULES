'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function setupTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'process-stale-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

function writeStaleArtifacts(root, entries) {
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');
  fs.writeFileSync(
    path.join(runtimeDir, 'stale-artifacts.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        unverified: [],
        stale: entries,
      },
      null,
      2
    ),
    'utf8'
  );
}

function makeStaleEntry(name, type = 'skill', opts = {}) {
  return {
    type,
    name,
    label: `[${type.toUpperCase()}] ${name}`,
    path: `.claude/${type}s/${name}/SKILL.md`,
    status: opts.status || 'stale',
    lastVerifiedAt: opts.lastVerifiedAt || '2025-06-01T00:00:00.000Z',
    processed: opts.processed || false,
  };
}

function readEvolutionRequests(root) {
  const filePath = path.join(root, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

test('reads stale-artifacts.json and creates evolution requests', () => {
  const root = setupTempProject();
  try {
    writeStaleArtifacts(root, [
      makeStaleEntry('auth-skill'),
      makeStaleEntry('deploy-skill'),
      makeStaleEntry('debug-skill'),
    ]);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    const result = processStaleSkills(root);

    assert.equal(result.processed, 3);
    assert.equal(result.skipped, 0);
    assert.equal(result.total, 3);

    const requests = readEvolutionRequests(root);
    assert.equal(requests.length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('respects --max flag', () => {
  const root = setupTempProject();
  try {
    const entries = [];
    for (let i = 0; i < 10; i++) {
      entries.push(makeStaleEntry(`skill-${i}`));
    }
    writeStaleArtifacts(root, entries);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    const result = processStaleSkills(root, { max: 3 });

    assert.equal(result.processed, 3);
    assert.equal(result.total, 10);

    const requests = readEvolutionRequests(root);
    assert.equal(requests.length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('filters by --type skill', () => {
  const root = setupTempProject();
  try {
    writeStaleArtifacts(root, [
      makeStaleEntry('auth-skill', 'skill'),
      makeStaleEntry('router-agent', 'agent'),
      makeStaleEntry('deploy-skill', 'skill'),
    ]);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    const result = processStaleSkills(root, { type: 'skill' });

    assert.equal(result.processed, 2);
    assert.equal(result.skipped, 1);

    const requests = readEvolutionRequests(root);
    assert.equal(requests.length, 2);
    for (const req of requests) {
      assert.equal(req.trigger, 'stale_skill');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('skips already-processed entries', () => {
  const root = setupTempProject();
  try {
    writeStaleArtifacts(root, [
      makeStaleEntry('fresh-skill'),
      makeStaleEntry('done-skill', 'skill', { processed: true }),
      makeStaleEntry('also-done', 'skill', { processed: true }),
    ]);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    const result = processStaleSkills(root);

    assert.equal(result.processed, 1);
    assert.equal(result.skipped, 2);

    const requests = readEvolutionRequests(root);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].skillName, 'fresh-skill');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('creates valid JSONL format', () => {
  const root = setupTempProject();
  try {
    writeStaleArtifacts(root, [
      makeStaleEntry('test-skill', 'skill', { lastVerifiedAt: '2025-06-15T12:00:00.000Z' }),
    ]);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    processStaleSkills(root);

    const requests = readEvolutionRequests(root);
    assert.equal(requests.length, 1);

    const req = requests[0];
    assert.equal(req.trigger, 'stale_skill');
    assert.equal(req.skillName, 'test-skill');
    assert.equal(typeof req.timestamp, 'string');
    assert.equal(req.lastVerifiedAt, '2025-06-15T12:00:00.000Z');
    assert.ok(req.evidence);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('handles empty stale-artifacts.json', () => {
  const root = setupTempProject();
  try {
    writeStaleArtifacts(root, []);

    const { processStaleSkills } = require('../../../.claude/tools/cli/process-stale-skills.cjs');
    const result = processStaleSkills(root);

    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.total, 0);

    const requestsPath = path.join(
      root,
      '.claude',
      'context',
      'runtime',
      'evolution-requests.jsonl'
    );
    // File should either not exist or be empty
    if (fs.existsSync(requestsPath)) {
      const content = fs.readFileSync(requestsPath, 'utf8').trim();
      assert.equal(content, '');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
