#!/usr/bin/env node
// @ts-check
/**
 * SPEC-015: Conductor-Main Gap Analyzer (CLI)
 *
 * Usage:
 *   node .claude/tools/cli/conductor-gap-analyzer.cjs --conductor <path> [--out <file>] [--json]
 *
 * Defaults:
 * - agent-studio path: process.cwd()
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ConductorGapAnalyzer } = require('../../lib/integration/conductor-gap-analyzer.cjs');

function parseArgs(argv = process.argv.slice(2)) {
  const get = name => {
    const idx = argv.findIndex(a => a === name || a.startsWith(`${name}=`));
    if (idx === -1) return null;
    const v = argv[idx].includes('=') ? argv[idx].split('=').slice(1).join('=') : argv[idx + 1];
    return v || null;
  };

  return {
    conductorPath: get('--conductor'),
    outPath: get('--out'),
    json: argv.includes('--json'),
    full: argv.includes('--full'),
  };
}

function renderMinimalReport(conductorPath, agentStudioPath, gaps, patterns) {
  let report = '# Gap Analysis Report\n\n';
  report += `**Conductor-Main**: ${conductorPath}\n`;
  report += `**Agent-Studio**: ${agentStudioPath}\n\n`;

  report += '## Missing Features\n\n';
  report += 'Features agent-studio has that conductor-main is missing:\n\n';
  for (const feature of gaps.missing || []) {
    const featureName = typeof feature === 'string' ? feature : feature.name;
    const effort = typeof feature === 'string' ? 'Unknown' : feature.effort;
    report += `- ${featureName} (Effort: ${effort})\n`;
  }

  report += '\n## Redundant Features\n\n';
  for (const feature of gaps.redundant || []) {
    report += `- ${feature}\n`;
  }

  report += '\n## Incompatible Features\n\n';
  for (const feature of gaps.incompatible || []) {
    report += `- ${feature}\n`;
  }

  report += '\n## Statistics\n\n';
  report += `- **Tracks**: ${gaps.trackCount}\n`;

  report += '\n## Migration Notes\n\n';
  report += 'Identified missing patterns:\n\n';
  for (const p of patterns || []) {
    if (!p || typeof p !== 'object') continue;
    report += `- ${p.name}: ${p.description} (Effort: ${p.effort})\n`;
  }

  return report;
}

async function run(options) {
  const agentStudioPath = path.join(process.cwd(), '.claude');

  if (!options || !options.conductorPath) {
    throw new Error('Missing required argument: --conductor <path>');
  }

  const analyzer = new ConductorGapAnalyzer(
    path.resolve(options.conductorPath),
    path.resolve(agentStudioPath)
  );

  const gaps = await analyzer.analyzeFeatureGaps();
  const patterns = await analyzer.identifyMissingPatterns();

  const full = Boolean(options.full);

  if (options.json) {
    const payload = { gaps, patterns };
    if (full) {
      payload.comparison = await analyzer.compareCodebases();
    }
    return payload;
  }

  if (full) {
    return await analyzer.generateGapReport();
  }

  return renderMinimalReport(options.conductorPath, agentStudioPath, gaps, patterns);
}

async function main() {
  try {
    const options = parseArgs();
    const output = await run(options);

    const text = options.json ? JSON.stringify(output, null, 2) : String(output);

    if (options.outPath) {
      const outAbs = path.resolve(options.outPath);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.writeFileSync(outAbs, text, 'utf8');
    } else {
      process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    }
  } catch (err) {
    process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  run,
  main,
};
