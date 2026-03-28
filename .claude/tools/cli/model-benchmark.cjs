#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

/**
 * Model Benchmark Harness
 *
 * Runs a 5-dimension evaluation of LLM models:
 *   1. Accuracy  — task completion rate
 *   2. Latency   — tokens/sec throughput
 *   3. Memory    — peak RAM during inference
 *   4. Cost      — input/output token pricing
 *   5. Safety    — prompt injection resistance
 *
 * Usage:
 *   node .claude/tools/cli/model-benchmark.cjs --model <name-or-path> [options]
 *
 * Options:
 *   --model <name>       Model name or HuggingFace repo id (required)
 *   --baseline <path>    Path to baseline JSON (default: .claude/context/data/benchmark-baselines.json)
 *   --output <path>      Write results JSON to file (default: stdout)
 *   --dimensions <list>  Comma-separated dimensions to evaluate (default: all)
 *   --compare <name>     Compare against a baseline model by name
 *   --json               Force JSON-only output (no prose)
 *   --help               Show this help message
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    model: null,
    baseline: path.join(PROJECT_ROOT, '.claude/context/data/benchmark-baselines.json'),
    output: null,
    dimensions: ['accuracy', 'latency', 'memory', 'cost', 'safety'],
    compare: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        opts.model = args[++i];
        break;
      case '--baseline':
        opts.baseline = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--dimensions':
        opts.dimensions = args[++i].split(',').map(d => d.trim());
        break;
      case '--compare':
        opts.compare = args[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }
  return opts;
}

function loadBaselines(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return { models: {}, dimensions: {} };
  }
  try {
    const parsed = safeParseJSON(fs.readFileSync(baselinePath, 'utf8'), {
      models: {},
      dimensions: {},
    });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    console.error(`Warning: Could not parse baseline file at ${baselinePath}`);
    return { models: {}, dimensions: {} };
  }
}

// ---------------------------------------------------------------------------
// Dimension evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate accuracy dimension.
 * In a real deployment this would run a test suite against the model.
 * Here we provide a scaffold that returns synthetic scores and can be
 * extended with actual API calls.
 */
function evaluateAccuracy(modelName) {
  return {
    dimension: 'accuracy',
    metrics: {
      taskCompletion: null,
      codeGeneration: null,
      reasoning: null,
    },
    status: 'pending',
    notes:
      `Accuracy evaluation requires running test prompts against ${modelName}. ` +
      'Populate by calling the model API with the benchmark prompt set.',
  };
}

/**
 * Evaluate latency dimension.
 */
function evaluateLatency(modelName) {
  return {
    dimension: 'latency',
    metrics: {
      tokensPerSecond: null,
      timeToFirstToken: null,
      medianResponseMs: null,
    },
    status: 'pending',
    notes:
      `Latency evaluation requires timed API calls to ${modelName}. ` +
      'Run 10+ inference calls and compute median/p95.',
  };
}

/**
 * Evaluate memory dimension.
 * For local models, this measures peak RSS during inference.
 * For API models, reports context window and output limits.
 */
function evaluateMemory(modelName) {
  return {
    dimension: 'memory',
    metrics: {
      peakRamMb: null,
      contextWindow: null,
      maxOutputTokens: null,
    },
    status: 'pending',
    notes:
      `Memory evaluation for ${modelName}. For local models, monitor RSS ` +
      'during inference. For API models, check documentation for context limits.',
  };
}

/**
 * Evaluate cost dimension.
 */
function evaluateCost(modelName) {
  return {
    dimension: 'cost',
    metrics: {
      inputPer1MTokens: null,
      outputPer1MTokens: null,
      cachePer1MTokens: null,
    },
    status: 'pending',
    notes:
      `Cost evaluation for ${modelName}. Check provider pricing page ` +
      'and populate manually or via API metadata.',
  };
}

/**
 * Evaluate safety dimension.
 * Runs a set of adversarial prompts and measures refusal/compliance.
 */
function evaluateSafety(modelName) {
  return {
    dimension: 'safety',
    metrics: {
      promptInjectionResistance: null,
      refusalAppropriatenessScore: null,
      jailbreakResistance: null,
    },
    status: 'pending',
    notes:
      `Safety evaluation for ${modelName}. Run the adversarial prompt ` +
      'suite and score compliance/refusal rates.',
  };
}

const EVALUATORS = {
  accuracy: evaluateAccuracy,
  latency: evaluateLatency,
  memory: evaluateMemory,
  cost: evaluateCost,
  safety: evaluateSafety,
};

// ---------------------------------------------------------------------------
// Scoring and comparison
// ---------------------------------------------------------------------------

function computeCompositeScore(results, baselineDimensions) {
  let totalWeight = 0;
  let weightedSum = 0;
  let scoredDimensions = 0;

  for (const result of results) {
    const dimConfig = baselineDimensions[result.dimension];
    if (!dimConfig) continue;

    const weight = dimConfig.weight || 0.2;
    const metrics = result.metrics;
    const values = Object.values(metrics).filter(v => v !== null && typeof v === 'number');

    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      weightedSum += avg * weight;
      totalWeight += weight;
      scoredDimensions++;
    }
  }

  return {
    composite: totalWeight > 0 ? weightedSum / totalWeight : null,
    scoredDimensions,
    totalDimensions: results.length,
  };
}

function compareWithBaseline(modelName, results, baselines, compareModel) {
  const target = compareModel || Object.keys(baselines.models)[0];
  const baselineData = baselines.models[target];

  if (!baselineData) {
    return { compareModel: target, status: 'no_baseline_found', deltas: {} };
  }

  const deltas = {};
  for (const result of results) {
    const dim = result.dimension;
    const baseMetrics = baselineData[dim];
    if (!baseMetrics) continue;

    deltas[dim] = {};
    for (const [key, value] of Object.entries(result.metrics)) {
      if (value === null || baseMetrics[key] === undefined) continue;
      const baseVal = baseMetrics[key];
      if (typeof baseVal === 'number' && baseVal !== 0) {
        deltas[dim][key] = {
          baseline: baseVal,
          current: value,
          delta: value - baseVal,
          deltaPercent: (((value - baseVal) / baseVal) * 100).toFixed(1) + '%',
        };
      }
    }
  }

  return { compareModel: target, status: 'compared', deltas };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();

  if (opts.help) {
    const helpText = fs
      .readFileSync(__filename, 'utf8')
      .split('\n')
      .filter(l => l.startsWith(' *'))
      .map(l => l.replace(/^ \* ?/, ''))
      .join('\n');
    console.log(helpText);
    process.exit(0);
  }

  if (!opts.model) {
    console.error('Error: --model is required. Use --help for usage.');
    process.exit(1);
  }

  const baselines = loadBaselines(opts.baseline);

  // Run evaluations for requested dimensions
  const results = [];
  for (const dim of opts.dimensions) {
    const evaluator = EVALUATORS[dim];
    if (!evaluator) {
      console.error(`Warning: Unknown dimension "${dim}". Skipping.`);
      continue;
    }
    results.push(evaluator(opts.model));
  }

  // Compute composite score
  const score = computeCompositeScore(results, baselines.dimensions || {});

  // Compare against baseline if requested
  let comparison = null;
  if (opts.compare || Object.keys(baselines.models).length > 0) {
    comparison = compareWithBaseline(opts.model, results, baselines, opts.compare);
  }

  // Build output
  const output = {
    model: opts.model,
    timestamp: new Date().toISOString(),
    dimensions: results,
    compositeScore: score,
    comparison,
    metadata: {
      baselineFile: opts.baseline,
      dimensionsEvaluated: opts.dimensions,
      harness: 'model-benchmark.cjs',
      version: '1.0.0',
    },
  };

  const jsonStr = JSON.stringify(output, null, 2);

  if (opts.output) {
    fs.writeFileSync(opts.output, jsonStr, 'utf8');
    if (!opts.json) {
      console.log(`Results written to ${opts.output}`);
    }
  } else {
    console.log(jsonStr);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateAccuracy,
  evaluateLatency,
  evaluateMemory,
  evaluateCost,
  evaluateSafety,
  computeCompositeScore,
  compareWithBaseline,
  loadBaselines,
  EVALUATORS,
};
