#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { ContextualMemory } = require('../../lib/memory/contextual-memory.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const FIXTURE_PATH = path.join(
  PROJECT_ROOT,
  'tests',
  'evals',
  'fixtures',
  'retrieval-quality-benchmark.json'
);
const REPORT_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'retrieval-quality-baseline-latest.json');

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'if',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'with',
]);

function parseBool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(token => token.length >= 4 && !STOPWORDS.has(token));
}

function deriveQuery(text, id) {
  const tokens = tokenize(text);
  const idTokens = tokenize(String(id || '').replace(/-/g, ' '));
  const merged = [...tokens, ...idTokens];
  const unique = [];
  for (const token of merged) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 5) break;
  }
  return unique.join(' ');
}

function deriveNeedles(text, id) {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(Boolean);
  const phrase = words.slice(0, Math.min(6, words.length)).join(' ');
  const idPhrase = normalizeText(String(id || '').replace(/-/g, ' '));
  return [phrase, idPhrase].filter(Boolean);
}

function buildBenchmarkCases({ gotchas, patterns, maxQueries }) {
  const half = Math.floor(maxQueries / 2);
  const gotchaSlice = gotchas.slice(0, half);
  const patternSlice = patterns.slice(0, maxQueries - gotchaSlice.length);

  const cases = [];
  for (const entry of gotchaSlice) {
    const text = entry.gotcha || entry.text || entry.description || '';
    const query = deriveQuery(text, entry.id);
    if (!query) continue;
    cases.push({
      id: `gotcha:${entry.id || cases.length + 1}`,
      sourceType: 'gotcha',
      expectedPath: 'gotchas.json',
      query,
      needles: deriveNeedles(text, entry.id),
    });
  }
  for (const entry of patternSlice) {
    const text = [entry.name, entry.description, entry.context].filter(Boolean).join(' ');
    const query = deriveQuery(text, entry.id);
    if (!query) continue;
    cases.push({
      id: `pattern:${entry.id || cases.length + 1}`,
      sourceType: 'pattern',
      expectedPath: 'patterns.json',
      query,
      needles: deriveNeedles(text, entry.id),
    });
  }
  return cases.slice(0, maxQueries);
}

function generateFixture(maxQueries) {
  const gotchasPath = path.join(MEMORY_DIR, 'gotchas.json');
  const patternsPath = path.join(MEMORY_DIR, 'patterns.json');
  const gotchasRaw = safeParseJSON(fs.readFileSync(gotchasPath, 'utf8'), null, null, []);
  const patternsRaw = safeParseJSON(fs.readFileSync(patternsPath, 'utf8'), null, null, []);
  const gotchas = Array.isArray(gotchasRaw.gotchas) ? gotchasRaw.gotchas : [];
  const patterns = Array.isArray(patternsRaw.patterns) ? patternsRaw.patterns : [];
  const cases = buildBenchmarkCases({ gotchas, patterns, maxQueries });
  return {
    generatedAt: new Date().toISOString(),
    source: 'real-memory-artifacts',
    total: cases.length,
    cases,
  };
}

function isRelevantResult(result, testCase) {
  const needles = Array.isArray(testCase.needles) ? testCase.needles : [];
  const payload = normalizeText(
    [result?.content, result?.metadata?.path, result?.metadata?.id, result?.source]
      .filter(Boolean)
      .join(' ')
  );
  if (!payload) return false;
  return needles.some(needle => payload.includes(normalizeText(needle)));
}

async function evaluateMode(mode, fixtureCases) {
  const previousMode = process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE;
  if (mode === 'expanded') process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE = 'expanded';
  else delete process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE;

  const memory = new ContextualMemory({
    projectRoot: PROJECT_ROOT,
    memoryDir: MEMORY_DIR,
  });

  let fallbackEvents = 0;
  const originalFallbackLogger = memory._recordSemanticFallback.bind(memory);
  memory._recordSemanticFallback = error => {
    fallbackEvents += 1;
    return originalFallbackLogger(error);
  };

  const latencies = [];
  let recallHits = 0;
  let reciprocalRankSum = 0;
  let keywordOnlyQueries = 0;
  const perCase = [];

  for (const testCase of fixtureCases) {
    const start = performance.now();
    const results = await memory.search(testCase.query, { limit: 10 });
    const duration = performance.now() - start;
    latencies.push(duration);

    const firstRelevantRank = results.findIndex(result => isRelevantResult(result, testCase));
    const hasRelevantTop5 = firstRelevantRank >= 0 && firstRelevantRank < 5;
    if (hasRelevantTop5) recallHits += 1;
    if (firstRelevantRank >= 0 && firstRelevantRank < 10) {
      reciprocalRankSum += 1 / (firstRelevantRank + 1);
    }

    const sources = new Set(
      results.map(result => String(result?.source || 'unknown').toLowerCase())
    );
    const hasVectorSource = sources.has('lancedb') || sources.has('hybrid');
    if (!hasVectorSource) keywordOnlyQueries += 1;

    perCase.push({
      id: testCase.id,
      query: testCase.query,
      firstRelevantRank: firstRelevantRank >= 0 ? firstRelevantRank + 1 : null,
      topSources: [...sources].slice(0, 3),
      latencyMs: Number(duration.toFixed(2)),
    });
  }

  if (previousMode == null) delete process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE;
  else process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE = previousMode;
  await memory.close();

  const total = fixtureCases.length || 1;
  return {
    mode,
    queries: fixtureCases.length,
    recallAt5: Number((recallHits / total).toFixed(4)),
    mrrAt10: Number((reciprocalRankSum / total).toFixed(4)),
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
    },
    fallbackRate: Number((fallbackEvents / total).toFixed(4)),
    keywordOnlyRate: Number((keywordOnlyQueries / total).toFixed(4)),
    perCase,
  };
}

function compareModes(legacy, expanded) {
  if (!legacy || !expanded) return null;
  const gates = {
    minRecallAt5Uplift: 0.03,
    minMrrAt10Delta: 0,
    maxP95RegressionRatio: 0.15,
    maxFallbackRateDelta: 0,
  };
  const recallDelta = expanded.recallAt5 - legacy.recallAt5;
  const mrrDelta = expanded.mrrAt10 - legacy.mrrAt10;
  const p95Ratio =
    legacy.latencyMs.p95 > 0
      ? (expanded.latencyMs.p95 - legacy.latencyMs.p95) / legacy.latencyMs.p95
      : 0;
  const fallbackDelta = expanded.fallbackRate - legacy.fallbackRate;
  return {
    deltas: {
      recallAt5: Number(recallDelta.toFixed(4)),
      mrrAt10: Number(mrrDelta.toFixed(4)),
      p95LatencyRatio: Number(p95Ratio.toFixed(4)),
      fallbackRate: Number(fallbackDelta.toFixed(4)),
    },
    thresholds: gates,
    pass:
      recallDelta >= gates.minRecallAt5Uplift &&
      mrrDelta >= gates.minMrrAt10Delta &&
      p95Ratio <= gates.maxP95RegressionRatio &&
      fallbackDelta <= gates.maxFallbackRateDelta,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = String(args.mode || 'both').toLowerCase();
  const maxQueries = Number(args.queries || 30);
  const refreshFixture = parseBool(args['refresh-fixture'], false);
  const writeReport = parseBool(args['write-report'], true);
  const fixturePath = path.resolve(args.fixture || FIXTURE_PATH);
  const reportPath = path.resolve(args['report-path'] || REPORT_PATH);

  let fixture;
  if (refreshFixture || !fs.existsSync(fixturePath)) {
    fixture = generateFixture(maxQueries);
    ensureDir(path.dirname(fixturePath));
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8');
  } else {
    fixture = safeParseJSON(fs.readFileSync(fixturePath, 'utf8'), null, null, { cases: [] });
  }

  const cases = Array.isArray(fixture.cases) ? fixture.cases.slice(0, maxQueries) : [];
  const runs = [];
  if (mode === 'legacy' || mode === 'both') runs.push(await evaluateMode('legacy', cases));
  if (mode === 'expanded' || mode === 'both') runs.push(await evaluateMode('expanded', cases));

  const legacy = runs.find(run => run.mode === 'legacy') || null;
  const expanded = runs.find(run => run.mode === 'expanded') || null;
  const comparison = compareModes(legacy, expanded);

  const report = {
    generatedAt: new Date().toISOString(),
    fixturePath: path.relative(PROJECT_ROOT, fixturePath),
    reportPath: path.relative(PROJECT_ROOT, reportPath),
    queryCount: cases.length,
    mode,
    runs,
    comparison,
  };

  if (writeReport) {
    ensureDir(path.dirname(reportPath));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
