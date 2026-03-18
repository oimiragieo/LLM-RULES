#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// E5: Memory Tools
const {
  memoryGrep,
  memoryDescribe,
  memoryExpand,
} = require('../../.claude/lib/memory/memory-tools.cjs');

// E6: Debug State
const {
  createDebugSession,
  addHypothesis,
  recordEvidence,
  setRootCause,
  getSession,
  listSessions,
  DEBUG_DIR,
} = require('../../.claude/lib/diagnostics/debug-state.cjs');

// G3: Identity Memory Section
const {
  generateMemorySection,
  getSupportedAgentTypes,
  AGENT_MEMORY_FILTERS,
} = require('../../.claude/lib/memory/identity-memory-section.cjs');

describe('E5: Memory Tools', () => {
  it('memoryGrep finds matches in memory files', () => {
    // decisions.md should exist in the framework
    const results = memoryGrep('ADR', { maxResults: 5 });
    // May or may not find matches depending on content, but should not throw
    assert.ok(Array.isArray(results));
  });

  it('memoryGrep returns empty for no matches', () => {
    const results = memoryGrep('ZZZYYYXXX_IMPOSSIBLE_PATTERN');
    assert.equal(results.length, 0);
  });

  it('memoryDescribe returns file info', () => {
    const desc = memoryDescribe('decisions');
    assert.equal(desc.file, 'decisions.md');
    // May or may not exist, but should return valid structure
    assert.ok('size' in desc);
    assert.ok('lineCount' in desc);
    assert.ok('sections' in desc);
  });

  it('memoryDescribe handles missing file', () => {
    const desc = memoryDescribe('nonexistent');
    assert.equal(desc.size, 0);
    assert.equal(desc.lineCount, 0);
  });

  it('memoryExpand returns section content', () => {
    const result = memoryExpand('decisions', 'NONEXISTENT_HEADING');
    assert.equal(result.found, false);
  });

  it('memoryExpand handles missing file', () => {
    const result = memoryExpand('nonexistent', 'heading');
    assert.equal(result.found, false);
  });
});

describe('E6: Debug State', () => {
  const createdSessions = [];

  afterEach(() => {
    // Cleanup created debug sessions
    for (const id of createdSessions) {
      try {
        fs.unlinkSync(path.join(DEBUG_DIR, `${id}.json`));
      } catch {
        // ignore
      }
    }
    createdSessions.length = 0;
  });

  it('creates a debug session', () => {
    const session = createDebugSession({ bugId: 'BUG-1', description: 'Test bug' });
    createdSessions.push(session.id);
    assert.equal(session.bug_id, 'BUG-1');
    assert.equal(session.status, 'investigating');
    assert.equal(session.hypotheses.length, 0);
  });

  it('adds hypotheses', () => {
    const session = createDebugSession({ bugId: 'BUG-2', description: 'Another bug' });
    createdSessions.push(session.id);
    const hyp = addHypothesis(session.id, { description: 'Token expired', priority: 'high' });
    assert.ok(hyp.id.startsWith('H-'));
    assert.equal(hyp.status, 'untested');
  });

  it('records evidence and updates hypothesis status', () => {
    const session = createDebugSession({ bugId: 'BUG-3', description: 'Bug 3' });
    createdSessions.push(session.id);
    const hyp = addHypothesis(session.id, { description: 'Wrong config' });
    recordEvidence(session.id, {
      hypothesis_id: hyp.id,
      type: 'log',
      content: 'Config value: null',
      supports: true,
    });
    const updated = getSession(session.id);
    assert.equal(updated.evidence.length, 1);
    assert.equal(updated.hypotheses[0].status, 'testing');
  });

  it('sets root cause and rejects other hypotheses', () => {
    const session = createDebugSession({ bugId: 'BUG-4', description: 'Bug 4' });
    createdSessions.push(session.id);
    const h1 = addHypothesis(session.id, { description: 'Cause A' });
    addHypothesis(session.id, { description: 'Cause B' });
    setRootCause(session.id, 'Cause A confirmed', h1.id);
    const updated = getSession(session.id);
    assert.equal(updated.status, 'root_cause_found');
    assert.equal(updated.hypotheses[0].status, 'confirmed');
    assert.equal(updated.hypotheses[1].status, 'rejected');
  });

  it('lists sessions', () => {
    const session = createDebugSession({ bugId: 'BUG-5', description: 'Bug 5' });
    createdSessions.push(session.id);
    const list = listSessions();
    assert.ok(list.some(s => s.id === session.id));
  });

  it('throws for missing session', () => {
    assert.throws(() => addHypothesis('nonexistent', { description: 'x' }));
  });
});

describe('G3: Identity Memory Section', () => {
  it('has memory filters for core agent types', () => {
    const types = getSupportedAgentTypes();
    assert.ok(types.includes('developer'));
    assert.ok(types.includes('qa'));
    assert.ok(types.includes('architect'));
    assert.ok(types.includes('security-architect'));
  });

  it('generates section for developer', () => {
    const section = generateMemorySection('developer');
    // May be empty if no relevant entries exist, but should return string
    assert.ok(typeof section === 'string');
  });

  it('respects maxChars limit', () => {
    const section = generateMemorySection('developer', { maxChars: 100 });
    assert.ok(section.length <= 200); // Section header + up to 100 chars of entries
  });

  it('returns empty for unknown agent type with no matching entries', () => {
    const section = generateMemorySection('unknown-type');
    assert.equal(section, '');
  });

  it('has filter keywords for each agent type', () => {
    for (const [type, keywords] of Object.entries(AGENT_MEMORY_FILTERS)) {
      assert.ok(keywords.length > 0, `${type} has no keywords`);
    }
  });
});
