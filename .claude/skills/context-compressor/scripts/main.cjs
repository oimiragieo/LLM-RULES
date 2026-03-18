#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'context-compressor');

// Python scripts live in context-compressor (archived source)
const PYTHON_SCRIPTS_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'context-compressor',
  'scripts'
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
      PYTHONIOENCODING: 'utf-8', // Force UTF-8 on Windows (cp1252 breaks on unicode)
      PYTHONUTF8: '1', // Python 3.15+ UTF-8 mode
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

function stripAnsi(str) {
  // Strip ANSI escape codes and common emoji byte sequences
  return str
    .replace(/\x1b\[[0-9;]*m/g, '') // ANSI color codes
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // Emoji unicode
    .replace(/[^\x20-\x7E\t]/g, '') // Non-printable
    .trim();
}

function normalizeSearchResults(rawText, limit) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => stripAnsi(line))
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
    // Python workflow output: extract compressed segments as evidence
    // Structure: { profile, compressed: { compressed_text, segments: [{ text }] }, evidence_validation }
    if (value.compressed && Array.isArray(value.compressed.segments)) {
      for (const seg of value.compressed.segments) {
        if (seg.text && seg.text.length > 20 && seg.selected !== false) {
          bucket.push(seg.text.trim());
        }
      }
      if (bucket.length > 0) return bucket;
    }

    const preferredKeys = [
      'compressed_text',
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
        source: sourceQuery || 'context-compressor',
      });
      continue;
    }
    records[target].push({
      text,
      timestamp,
      source: sourceQuery || 'context-compressor',
      section: 'context-compressor',
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

function loadExistingTextsFromMemory(memoryDir) {
  const existingTexts = new Set();
  for (const file of ['patterns.json', 'gotchas.json']) {
    const filePath = path.join(memoryDir, file);
    try {
      if (!fs.existsSync(filePath)) continue;
      const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const text = typeof entry === 'string' ? entry : entry?.text;
        if (text) existingTexts.add(text.toLowerCase().trim());
      }
    } catch (_e) {
      // Corrupt JSON or read error — skip this file, keep all incoming records for this category
    }
  }
  return existingTexts;
}

function deduplicateAgainstMemory(records, memoryDir) {
  const existingTexts = loadExistingTextsFromMemory(memoryDir);

  let total = 0;
  let filtered = 0;

  const dedupedRecords = {};
  for (const category of Object.keys(records)) {
    dedupedRecords[category] = [];
    for (const record of records[category]) {
      total++;
      const key = (record.text || '').toLowerCase().trim();
      if (key && existingTexts.has(key)) {
        filtered++;
      } else {
        dedupedRecords[category].push(record);
      }
    }
  }

  return {
    dedupedRecords,
    stats: { total, kept: total - filtered, filtered },
  };
}

function computeAdaptiveRatio(corpusTokens) {
  if (corpusTokens < 8000) return 0.8;
  if (corpusTokens < 32000) return 0.5;
  if (corpusTokens < 100000) return 0.2;
  return 0.1;
}

function applyMemoryRecordsToFiles(records, memoryDir) {
  fs.mkdirSync(memoryDir, { recursive: true });
  mergeUniqueJsonEntries(path.join(memoryDir, 'patterns.json'), records.patterns);
  mergeUniqueJsonEntries(path.join(memoryDir, 'gotchas.json'), records.gotchas);
  appendMarkdownEntries(path.join(memoryDir, 'issues.md'), 'Token Saver Issues', records.issues);
  appendMarkdownEntries(
    path.join(memoryDir, 'decisions.md'),
    'Token Saver Decisions',
    records.decisions
  );
}

function runTokenSaverWorkflow({
  corpusFile,
  query,
  mode,
  failOnInsufficientEvidence,
  skeletonRatio,
}) {
  const scriptPath = path.join(PYTHON_SCRIPTS_DIR, 'run_skill_workflow.py');
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
  if (skeletonRatio != null) args.push('--skeleton-ratio', String(skeletonRatio));
  const proc = runCommand('python', args);

  // Try to parse JSON output even on non-zero exit codes.
  // Python returns exit 1 for insufficient evidence (valid result, not a crash)
  // and exit 2 for actual errors (missing input, bad args).
  const stdout = (proc.stdout || '').trim();
  if (stdout.startsWith('{')) {
    try {
      return { ok: true, data: JSON.parse(stdout) };
    } catch (_parseErr) {
      // Fall through to error handling
    }
  }

  if (proc.status !== 0) {
    return {
      ok: false,
      status: proc.status || 1,
      stdout: proc.stdout || '',
      stderr: proc.stderr || '',
    };
  }

  try {
    return { ok: true, data: JSON.parse(stdout || '{}') };
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
  const corpusFile = path.join(
    RUNTIME_DIR,
    `corpus-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );

  // Build corpus: for each hit, include file content (not just path)
  // Semantic search results often have no inline snippets — read the files directly
  const MAX_FILE_CHARS = 8000; // ~2K tokens per file to keep corpus bounded
  const corpusParts = [];
  for (const hit of hits) {
    let content = hit.snippets.join('\n').trim();
    if (!content && hit.file) {
      // Read actual file content for files with no inline snippets
      try {
        const filePath = path.isAbsolute(hit.file) ? hit.file : path.join(PROJECT_ROOT, hit.file);
        const raw = fs.readFileSync(filePath, 'utf8');
        content = raw.slice(0, MAX_FILE_CHARS);
        if (raw.length > MAX_FILE_CHARS) content += '\n[... truncated]';
      } catch (_e) {
        content = '(file not readable)';
      }
    }
    corpusParts.push(`FILE: ${hit.file}\n${content}`);
  }
  const corpus = corpusParts.join('\n\n---\n\n');
  fs.writeFileSync(corpusFile, corpus || String(searchCmd.stdout || ''), 'utf8');

  // Compute adaptive skeleton ratio from corpus size unless user explicitly provided one
  const corpusTokens = Math.ceil(corpus.length / 4);
  const skeletonRatio =
    input.skeletonRatio != null ? Number(input.skeletonRatio) : computeAdaptiveRatio(corpusTokens);

  const workflow = runWorkflow({
    corpusFile,
    query,
    mode,
    failOnInsufficientEvidence,
    skeletonRatio,
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

  const rawMemoryRecords = mapCompressionToMemoryRecords(workflow.data, { query });
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const { dedupedRecords: memoryRecords, stats: dedupStats } = deduplicateAgainstMemory(
    rawMemoryRecords,
    memoryDir
  );
  if (persistFiles) {
    applyMemoryRecordsToFiles(memoryRecords, memoryDir);
  }

  // --- Token & Cost Savings Telemetry ---
  const outputTokens = Math.ceil(JSON.stringify(workflow.data).length / 4);
  const savedTokens = Math.max(0, corpusTokens - outputTokens);

  let activeModelStr = 'claude-sonnet-4.6';
  try {
    const { getState } = require('../../../lib/routing/router-state.cjs');
    const { resolveAgentModel } = require('../../../lib/utils/agent-config-reader.cjs');

    const state = getState();
    const agentName = state.mode === 'agent' ? state.taskDescription : 'router';
    const resolved = resolveAgentModel(agentName);

    if (resolved && resolved.model) {
      activeModelStr = resolved.model;
    }
  } catch (_e) {
    // Graceful fallback
  }

  const model = String(input.model || activeModelStr).toLowerCase();
  let costPerMillion = 3.0; // Default: Sonnet 4.6
  if (model.includes('opus')) {
    costPerMillion = 5.0;
  } else if (model.includes('haiku')) {
    costPerMillion = 1.0;
  }

  const costSavingsUsd = (savedTokens / 1_000_000) * costPerMillion;

  const telemetryData = {
    timestamp: new Date().toISOString(),
    query,
    model,
    originalTokens: corpusTokens,
    compressedTokens: outputTokens,
    savedTokens,
    estimatedSavingsUsd: costSavingsUsd,
  };

  try {
    const statsFile = path.join(RUNTIME_DIR, 'token-saver-telemetry.jsonl');
    fs.appendFileSync(statsFile, JSON.stringify(telemetryData) + '\n', 'utf8');
  } catch (_e) {
    // Non-blocking telemetry
  }

  return {
    ok: true,
    search: { query, hits: hits.length, limit },
    evidence: { sufficient },
    compression: {
      mode,
      corpusFile,
      skeletonRatio,
    },
    telemetry: telemetryData,
    memoryRecords,
    dedupStats,
    persistMode: persistFiles ? 'files' : 'memoryrecord_payload_only',
    memoryRecordHint:
      'Use MemoryRecord to persist these payloads so sync-memory-index hook updates the search index.',
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
context-compressor wrapper

Usage:
  node main.cjs --query "<question>" [--mode evidence_aware|query_guided|baseline] [--limit 20]
                [--no-fail-on-insufficient-evidence] [--persist-files] [--skeleton-ratio 0.5]
                [--model claude-sonnet-4.6]
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
    skeletonRatio: options['skeleton-ratio'] ? Number(options['skeleton-ratio']) : undefined,
    model: options.model,
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
  deduplicateAgainstMemory,
  computeAdaptiveRatio,
  applyMemoryRecordsToFiles,
  inferEvidenceSufficiency,
  runSearchQuery,
  main,
};
