#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');

const RUNTIME_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'token-saver-context-compression'
);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function runCommand(cmd, args, cwd = PROJECT_ROOT) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: {
      ...process.env,
      PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
    },
  });
}

function runSearchQuery(run, query) {
  const pnpmResult = run('pnpm', ['search:code', '--', query], PROJECT_ROOT);
  if (pnpmResult.status === 0) return pnpmResult;

  const fallback = run(
    process.execPath,
    [path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'hybrid-search.cjs'), query],
    PROJECT_ROOT
  );
  if (fallback.status === 0) return fallback;

  return {
    status: 1,
    stdout: fallback.stdout || pnpmResult.stdout || '',
    stderr: fallback.stderr || pnpmResult.stderr || '',
  };
}

function normalizeSearchResults(rawText, limit) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const filePattern = /^\d+\.\s+(.+?)\s+\(\d+(\.\d+)?%\)$/;
  const hits = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(filePattern);
    if (match) {
      current = { file: match[1], snippets: [] };
      hits.push(current);
      continue;
    }
    if (current && !line.startsWith('Search completed')) {
      current.snippets.push(line.replace(/^[-•]\s*/, '').trim());
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

function flattenEvidenceStrings(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === 'string') {
    const clean = value.trim();
    if (clean.length > 0) bucket.push(clean);
    return bucket;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenEvidenceStrings(item, bucket);
    return bucket;
  }
  if (typeof value === 'object') {
    const preferredKeys = [
      'text',
      'content',
      'summary',
      'snippet',
      'note',
      'claim',
      'decision',
      'finding',
      'evidence',
    ];
    for (const key of preferredKeys) {
      if (key in value) flattenEvidenceStrings(value[key], bucket);
    }
    if (bucket.length === 0) {
      for (const key of Object.keys(value)) {
        flattenEvidenceStrings(value[key], bucket);
      }
    }
  }
  return bucket;
}

function classifyMemoryTarget(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(gotcha|pitfall|anti-pattern|risk|warning|failure)/.test(normalized)) return 'gotchas';
  if (/(issue|bug|error|incident|defect|gap)/.test(normalized)) return 'issues';
  if (/(decision|tradeoff|choose|selected|rationale)/.test(normalized)) return 'decisions';
  return 'patterns';
}

function mapCompressionToMemoryRecords(compressionOutput, metadata = {}) {
  const rawTexts = flattenEvidenceStrings(compressionOutput, []);
  const unique = Array.from(new Set(rawTexts)).slice(0, 24);
  const timestamp = new Date().toISOString();
  const sourceQuery = String(metadata.query || '').trim();

  const records = {
    patterns: [],
    gotchas: [],
    issues: [],
    decisions: [],
  };

  for (const text of unique) {
    const target = classifyMemoryTarget(text);
    if (target === 'patterns' || target === 'gotchas') {
      records[target].push({
        text,
        timestamp,
        source: sourceQuery || 'token-saver-context-compression',
      });
      continue;
    }
    records[target].push({
      text,
      timestamp,
      source: sourceQuery || 'token-saver-context-compression',
      section: 'token-saver-context-compression',
    });
  }

  return records;
}

function mergeUniqueJsonEntries(filePath, incoming) {
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]')
    : [];
  const map = new Map();
  for (const item of existing) {
    const key = typeof item === 'string' ? item : item?.text;
    if (!key) continue;
    map.set(key, item);
  }
  for (const item of incoming) {
    map.set(item.text, item);
  }
  fs.writeFileSync(filePath, JSON.stringify(Array.from(map.values()), null, 2) + '\n', 'utf8');
}

function appendMarkdownEntries(filePath, heading, entries) {
  if (!entries.length) return;
  const prior = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const block = [
    '',
    `## ${heading} (${new Date().toISOString().slice(0, 10)})`,
    ...entries.map(entry => `- ${entry.text}`),
    '',
  ].join('\n');
  fs.writeFileSync(filePath, prior + block, 'utf8');
}

function applyMemoryRecordsToFiles(records, memoryDir) {
  fs.mkdirSync(memoryDir, { recursive: true });
  mergeUniqueJsonEntries(path.join(memoryDir, 'patterns.json'), records.patterns);
  mergeUniqueJsonEntries(path.join(memoryDir, 'gotchas.json'), records.gotchas);
  appendMarkdownEntries(path.join(memoryDir, 'issues.md'), 'Token Saver Issues', records.issues);
  appendMarkdownEntries(path.join(memoryDir, 'decisions.md'), 'Token Saver Decisions', records.decisions);
}

function runTokenSaverWorkflow({ corpusFile, query, mode, failOnInsufficientEvidence }) {
  const scriptPath = path.join(__dirname, 'run_skill_workflow.py');
  const args = [
    scriptPath,
    '--file',
    corpusFile,
    '--mode',
    mode,
    '--query',
    query,
    '--output-format',
    'json',
  ];
  if (failOnInsufficientEvidence) args.push('--fail-on-insufficient-evidence');
  const proc = runCommand('python', args);
  if (proc.status !== 0) {
    return {
      ok: false,
      status: proc.status || 1,
      stdout: proc.stdout || '',
      stderr: proc.stderr || '',
    };
  }
  try {
    return { ok: true, data: JSON.parse(proc.stdout || '{}') };
  } catch (error) {
    return {
      ok: false,
      status: 1,
      stdout: proc.stdout || '',
      stderr: `Failed to parse workflow JSON: ${error.message}`,
    };
  }
}

function inferEvidenceSufficiency(workflowResult) {
  if (!workflowResult || typeof workflowResult !== 'object') return false;
  if ('evidence_sufficient' in workflowResult) return Boolean(workflowResult.evidence_sufficient);
  if ('sufficient' in workflowResult) return Boolean(workflowResult.sufficient);
  const validation = workflowResult.validation || workflowResult.evidence || null;
  if (validation && typeof validation === 'object') {
    if ('sufficient' in validation) return Boolean(validation.sufficient);
    if ('is_sufficient' in validation) return Boolean(validation.is_sufficient);
  }
  return true;
}

// eslint-disable-next-line complexity
function main(input = {}, deps = {}) {
  const run = deps.runCommand || runCommand;
  const runWorkflow = deps.runTokenSaverWorkflow || runTokenSaverWorkflow;

  const query = String(input.query || '').trim();
  if (!query) {
    return { ok: false, error: 'query is required' };
  }

  const mode = ['baseline', 'query_guided', 'evidence_aware'].includes(input.mode)
    ? input.mode
    : 'evidence_aware';
  const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Number(input.limit)) : 20;
  const failOnInsufficientEvidence = input.failOnInsufficientEvidence !== false;
  const persistFiles = input.persistFiles === true;

  const searchCmd = runSearchQuery(run, query);
  if (searchCmd.status !== 0) {
    return {
      ok: false,
      stage: 'search',
      error: 'search command failed',
      details: searchCmd.stderr || searchCmd.stdout || '',
    };
  }

  const hits = normalizeSearchResults(searchCmd.stdout, limit);
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const corpusFile = path.join(RUNTIME_DIR, `corpus-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const corpus = hits
    .map(hit => `FILE: ${hit.file}\n${hit.snippets.join('\n')}`.trim())
    .join('\n\n---\n\n');
  fs.writeFileSync(corpusFile, corpus || String(searchCmd.stdout || ''), 'utf8');

  const workflow = runWorkflow({
    corpusFile,
    query,
    mode,
    failOnInsufficientEvidence,
  });

  if (!workflow.ok) {
    return {
      ok: false,
      stage: 'compression',
      error: workflow.stderr || 'token-saver workflow failed',
      details: workflow.stdout || '',
    };
  }

  const sufficient = inferEvidenceSufficiency(workflow.data);
  if (failOnInsufficientEvidence && !sufficient) {
    return {
      ok: false,
      stage: 'evidence_gate',
      error: 'insufficient evidence',
      evidenceSufficient: false,
    };
  }

  const memoryRecords = mapCompressionToMemoryRecords(workflow.data, { query });
  if (persistFiles) {
    const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
    applyMemoryRecordsToFiles(memoryRecords, memoryDir);
  }

  return {
    ok: true,
    search: { query, hits: hits.length, limit },
    evidence: { sufficient },
    compression: {
      mode,
      corpusFile,
    },
    memoryRecords,
    persistMode: persistFiles ? 'files' : 'memoryrecord_payload_only',
    memoryRecordHint:
      'Use MemoryRecord to persist these payloads so sync-memory-index hook updates the search index.',
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
token-saver-context-compression wrapper

Usage:
  node main.cjs --query "<question>" [--mode evidence_aware|query_guided|baseline] [--limit 20]
                [--no-fail-on-insufficient-evidence] [--persist-files]
`);
    process.exit(0);
  }

  const result = main({
    query: options.query,
    mode: options.mode,
    limit: options.limit ? Number(options.limit) : undefined,
    failOnInsufficientEvidence: !(
      options['no-fail-on-insufficient-evidence'] === true ||
      String(options['fail-on-insufficient-evidence']).toLowerCase() === 'false'
    ),
    persistFiles: options['persist-files'] === true,
  });

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  parseArgs,
  normalizeSearchResults,
  flattenEvidenceStrings,
  classifyMemoryTarget,
  mapCompressionToMemoryRecords,
  applyMemoryRecordsToFiles,
  inferEvidenceSufficiency,
  runSearchQuery,
  main,
};
