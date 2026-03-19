'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ExportFormat,
  generateExport,
  buildToolManifest,
} = require('../../.claude/lib/export/multi-export.cjs');

// ─── ExportFormat ───────────────────────────────────────────────────────────

describe('ExportFormat', () => {
  it('exports format values', () => {
    assert.equal(ExportFormat.JSON, 'json');
    assert.equal(ExportFormat.MARKDOWN, 'markdown');
    assert.equal(ExportFormat.CSV, 'csv');
  });
});

// ─── buildToolManifest ──────────────────────────────────────────────────────

describe('buildToolManifest', () => {
  it('builds manifest from agents list', () => {
    const agents = [
      { id: 'developer', tools: ['Read', 'Write'], skills: ['tdd'] },
      { id: 'qa', tools: ['Read', 'Bash'], skills: ['testing'] },
    ];
    const manifest = buildToolManifest(agents);
    assert.equal(manifest.agentCount, 2);
    assert.ok(manifest.tools.includes('Read'));
    assert.ok(manifest.tools.includes('Write'));
    assert.ok(manifest.tools.includes('Bash'));
    assert.ok(manifest.skills.includes('tdd'));
    assert.ok(manifest.skills.includes('testing'));
  });

  it('deduplicates tools', () => {
    const agents = [
      { id: 'a', tools: ['Read', 'Write'], skills: [] },
      { id: 'b', tools: ['Read', 'Edit'], skills: [] },
    ];
    const manifest = buildToolManifest(agents);
    const readCount = manifest.tools.filter(t => t === 'Read').length;
    assert.equal(readCount, 1);
  });

  it('handles empty agents', () => {
    const manifest = buildToolManifest([]);
    assert.equal(manifest.agentCount, 0);
    assert.deepEqual(manifest.tools, []);
  });

  it('includes timestamp', () => {
    const manifest = buildToolManifest([]);
    assert.equal(typeof manifest.generatedAt, 'string');
  });
});

// ─── generateExport ─────────────────────────────────────────────────────────

describe('generateExport', () => {
  const sampleData = {
    agents: [
      { id: 'developer', type: 'core', tools: ['Read', 'Write'], skills: ['tdd'] },
      { id: 'qa', type: 'core', tools: ['Read', 'Bash'], skills: ['testing'] },
    ],
    skills: [
      { name: 'tdd', category: 'workflow' },
      { name: 'debugging', category: 'workflow' },
    ],
  };

  it('exports as JSON', () => {
    const result = generateExport(sampleData, ExportFormat.JSON);
    const parsed = JSON.parse(result);
    assert.equal(parsed.agents.length, 2);
    assert.equal(parsed.skills.length, 2);
  });

  it('JSON includes metadata', () => {
    const result = generateExport(sampleData, ExportFormat.JSON);
    const parsed = JSON.parse(result);
    assert.ok(parsed.metadata);
    assert.equal(typeof parsed.metadata.exportedAt, 'string');
    assert.equal(parsed.metadata.format, 'json');
  });

  it('exports as Markdown', () => {
    const result = generateExport(sampleData, ExportFormat.MARKDOWN);
    assert.ok(result.includes('# Agent Studio Export'));
    assert.ok(result.includes('developer'));
    assert.ok(result.includes('qa'));
  });

  it('Markdown includes tables', () => {
    const result = generateExport(sampleData, ExportFormat.MARKDOWN);
    assert.ok(result.includes('|'));
    assert.ok(result.includes('---'));
  });

  it('exports as CSV', () => {
    const result = generateExport(sampleData, ExportFormat.CSV);
    const lines = result.trim().split('\n');
    assert.ok(lines[0].includes('id'));
    assert.ok(lines.length >= 3); // header + 2 agents
  });

  it('CSV has proper escaping', () => {
    const data = {
      agents: [{ id: 'test', type: 'core', tools: ['Read, Write'], skills: ['tdd'] }],
      skills: [],
    };
    const result = generateExport(data, ExportFormat.CSV);
    assert.ok(result.includes('"')); // quoted field with comma
  });

  it('throws on unknown format', () => {
    assert.throws(() => generateExport(sampleData, 'xml'), /format/i);
  });

  it('handles empty data', () => {
    const result = generateExport({ agents: [], skills: [] }, ExportFormat.JSON);
    const parsed = JSON.parse(result);
    assert.equal(parsed.agents.length, 0);
  });
});
