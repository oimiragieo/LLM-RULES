'use strict';

const { getChangedFiles } = require('./failure-evidence.cjs');

const CONSERVATIVE_FALLBACK_COMMANDS = [
  'pnpm lint',
  'pnpm format:check',
  'pnpm validate',
  'pnpm test',
];
const BENCHMARK_ORDER = [
  'tests/benchmarks/flight-recorder-throughput.test.cjs',
  'tests/benchmarks/telemetry-hotpath-latency.test.cjs',
  'tests/lib/code-indexing/benchmark-fast-path.test.cjs',
  'tests/hooks/benchmarks/perf-regression-gate.test.cjs',
];

const RULES = [
  {
    name: 'routing',
    matches(filePath) {
      return (
        filePath.includes('.claude/lib/routing/') ||
        filePath.includes('.claude/scripts/validate-routing-consistency.cjs') ||
        filePath.includes('tests/lib/routing/')
      );
    },
    commands: ['pnpm validate:routing'],
    targetedTests: ['tests/lib/routing/*.test.cjs'],
    benchmarkSlices: [],
  },
  {
    name: 'hooks-docs',
    matches(filePath) {
      return (
        filePath.includes('.claude/hooks/') ||
        filePath.endsWith('.claude/docs/HOOKS_REFERENCE.md') ||
        filePath.includes('validate-hooks-doc-sync.cjs')
      );
    },
    commands: ['pnpm validate:hooks:docs'],
    targetedTests: ['tests/hooks/*.test.cjs'],
    benchmarkSlices: ['tests/hooks/benchmarks/perf-regression-gate.test.cjs'],
  },
  {
    name: 'agent-skill-contracts',
    matches(filePath) {
      return (
        filePath.includes('.claude/agents/') ||
        filePath.includes('.claude/skills/') ||
        filePath.includes('generate-agent-registry.cjs') ||
        filePath.includes('generate-skill-index.cjs')
      );
    },
    commands: ['pnpm validate:agent-skill-refs', 'pnpm agents:registry:validate'],
    targetedTests: [
      'tests/tools/cli/validate-agent-skill-references.test.cjs',
      'tests/tools/cli/generate-skill-index.test.cjs',
    ],
    benchmarkSlices: [],
  },
  {
    name: 'monitoring-benchmarks',
    matches(filePath) {
      return (
        filePath.includes('.claude/lib/monitoring/') ||
        filePath.includes('flight-recorder-maintenance.cjs') ||
        filePath.includes('telemetry')
      );
    },
    commands: [],
    targetedTests: [],
    benchmarkSlices: [
      'tests/benchmarks/flight-recorder-throughput.test.cjs',
      'tests/benchmarks/telemetry-hotpath-latency.test.cjs',
    ],
  },
  {
    name: 'code-indexing-benchmarks',
    matches(filePath) {
      return (
        filePath.includes('.claude/lib/code-indexing/') ||
        filePath.includes('tests/lib/code-indexing/')
      );
    },
    commands: [],
    targetedTests: ['tests/lib/code-indexing/*.test.cjs'],
    benchmarkSlices: ['tests/lib/code-indexing/benchmark-fast-path.test.cjs'],
  },
];

function unique(items) {
  return Array.from(new Set(items));
}

function sortBenchmarks(items) {
  return [...items].sort((left, right) => {
    const leftIndex = BENCHMARK_ORDER.indexOf(left);
    const rightIndex = BENCHMARK_ORDER.indexOf(right);
    const safeLeftIndex = leftIndex === -1 ? BENCHMARK_ORDER.length : leftIndex;
    const safeRightIndex = rightIndex === -1 ? BENCHMARK_ORDER.length : rightIndex;
    return safeLeftIndex - safeRightIndex || left.localeCompare(right);
  });
}

function planImpactedValidation(projectRoot, changedFiles) {
  const files = Array.isArray(changedFiles)
    ? changedFiles.filter(Boolean)
    : getChangedFiles(projectRoot);
  const matchedRules = RULES.filter(rule => files.some(filePath => rule.matches(String(filePath))));

  if (matchedRules.length === 0) {
    return {
      changedFiles: files,
      matchedRules: [],
      conservativeFallback: true,
      recommendedCommands: [...CONSERVATIVE_FALLBACK_COMMANDS],
      targetedTests: [],
      benchmarkSlices: [],
    };
  }

  return {
    changedFiles: files,
    matchedRules: matchedRules.map(rule => rule.name),
    conservativeFallback: false,
    recommendedCommands: unique([
      'pnpm lint',
      'pnpm format:check',
      'pnpm validate',
      ...matchedRules.flatMap(rule => rule.commands),
    ]),
    targetedTests: unique(matchedRules.flatMap(rule => rule.targetedTests)),
    benchmarkSlices: sortBenchmarks(unique(matchedRules.flatMap(rule => rule.benchmarkSlices))),
  };
}

module.exports = {
  CONSERVATIVE_FALLBACK_COMMANDS,
  RULES,
  planImpactedValidation,
};
