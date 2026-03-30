'use strict';

/**
 * Readiness CLI
 * =============
 *
 * Commander-based CLI entry point for readiness scoring and remediation.
 *
 * Commands:
 *   score      Run ReadinessScorer and output report (default: terminal format)
 *   report     Alias for score --format markdown
 *   remediate  Invoke ReadinessRemediation; supports --dry-run
 *   config     Show current readiness config from readiness-config.cjs
 *
 * Exports:
 *   createReadinessCLI()         — returns configured Commander program
 *   runScore(dir, options)       — programmatic score runner
 *   runRemediate(dir, options)   — programmatic remediation runner
 *
 * NOTE: chalk v5 is ESM-only; ANSI escape codes are used directly for CJS
 * compatibility, following the existing pattern in this codebase.
 *
 * @module readiness-cli
 */

const path = require('path');
const { Command } = require('commander');

// ANSI color helpers (chalk v5 is ESM-only; raw ANSI codes for CJS compatibility)
const chalk = {
  green: t => `\x1b[32m${t}\x1b[0m`,
  red: t => `\x1b[31m${t}\x1b[0m`,
  yellow: t => `\x1b[33m${t}\x1b[0m`,
  blue: t => `\x1b[34m${t}\x1b[0m`,
  bold: t => `\x1b[1m${t}\x1b[0m`,
};

/**
 * Run readiness scoring on a directory and output the formatted report.
 *
 * Accepts optional injectable dependencies (prefixed with _) to simplify
 * unit testing without require.cache manipulation.
 *
 * @param {string|null} dir - Target directory (null or undefined → process.cwd())
 * @param {object} [options={}]
 * @param {string} [options.format='terminal'] - Output format: terminal|json|markdown|summary
 * @param {Function} [options._ReadinessScorer] - Injectable ReadinessScorer class (for tests)
 * @param {Function} [options._ReportFormatter] - Injectable ReportFormatter class (for tests)
 * @param {Function} [options._output] - Injectable output writer fn(string) (for tests)
 * @returns {object} The readiness report
 */
function runScore(dir, options) {
  const opts = options || {};
  const targetDir = path.resolve(dir || process.cwd());
  const format = opts.format || 'terminal';
  const write = opts._output || (s => process.stdout.write(s));

  const ReadinessScorer =
    opts._ReadinessScorer || require('./readiness-scorer.cjs').ReadinessScorer;
  const ReportFormatter =
    opts._ReportFormatter || require('./report-formatter.cjs').ReportFormatter;

  const scorer = new ReadinessScorer({ repoPath: targetDir });
  const report = scorer.score();

  const formatter = new ReportFormatter(format);
  const output = formatter.format(report);

  write(output + '\n');
  return report;
}

/**
 * Run readiness remediation on a directory.
 *
 * First scores the project to find failing pillars, then invokes
 * ReadinessRemediation to scaffold missing configs.
 *
 * @param {string|null} dir - Target directory (null or undefined → process.cwd())
 * @param {object} [options={}]
 * @param {boolean} [options.dryRun=false] - Report without writing files
 * @param {Function} [options._ReadinessScorer] - Injectable ReadinessScorer class (for tests)
 * @param {Function} [options._ReadinessRemediation] - Injectable ReadinessRemediation class (for tests)
 * @param {Function} [options._output] - Injectable output writer fn(string) (for tests)
 * @returns {object} The remediation result
 */
function runRemediate(dir, options) {
  const opts = options || {};
  const targetDir = path.resolve(dir || process.cwd());
  const dryRun = opts.dryRun === true;
  const write = opts._output || (s => process.stdout.write(s));

  const ReadinessScorer =
    opts._ReadinessScorer || require('./readiness-scorer.cjs').ReadinessScorer;
  const ReadinessRemediation =
    opts._ReadinessRemediation || require('./readiness-remediation.cjs').ReadinessRemediation;

  // Score first to identify failing pillars
  const scorer = new ReadinessScorer({ repoPath: targetDir });
  const report = scorer.score();

  const remediator = new ReadinessRemediation({
    repoPath: targetDir,
    report,
    fix: true,
    dryRun,
  });

  const result = remediator.remediate();

  if (dryRun) {
    write(chalk.yellow('Dry run mode \u2014 no files will be written') + '\n');
    write('\n');
  }

  if (!result.plan || result.plan.length === 0) {
    write(chalk.green('\u2705 No remediation needed \u2014 all pillars passing') + '\n');
  } else {
    write(chalk.bold(`Remediation Plan (${result.summary.total} pillar(s)):`) + '\n');
    for (const item of result.plan) {
      const prefix = dryRun ? chalk.yellow('[would create]') : chalk.blue('[create]');
      write(`  ${prefix} ${item}\n`);
    }
    write('\n');
    write(
      `Summary: ${result.summary.completed} completed, ` +
        `${result.summary.planned} planned, ` +
        `${result.summary.failed} failed\n`
    );
  }

  return result;
}

/**
 * Create and return a configured Commander program.
 *
 * @returns {Command} Configured Commander program
 */
function createReadinessCLI() {
  const program = new Command();

  program.name('readiness').description('Readiness scoring and remediation CLI');

  // ── score ────────────────────────────────────────────────────────────────
  program
    .command('score')
    .description('Score project readiness and output report')
    .option('-d, --dir <directory>', 'Target directory (default: cwd)')
    .option('-f, --format <format>', 'Output format: terminal, json, markdown, summary', 'terminal')
    .action(opts => {
      try {
        runScore(opts.dir, { format: opts.format });
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── report (alias for score --format markdown) ────────────────────────────
  program
    .command('report')
    .description('Generate markdown readiness report (alias for score --format markdown)')
    .option('-d, --dir <directory>', 'Target directory (default: cwd)')
    .action(opts => {
      try {
        runScore(opts.dir, { format: 'markdown' });
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── remediate ─────────────────────────────────────────────────────────────
  program
    .command('remediate')
    .description('Remediate failing readiness pillars by scaffolding missing configs')
    .option('-d, --dir <directory>', 'Target directory (default: cwd)')
    .option('--dry-run', 'Report what would be created without writing files', false)
    .action(opts => {
      try {
        runRemediate(opts.dir, { dryRun: opts.dryRun });
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── config ────────────────────────────────────────────────────────────────
  program
    .command('config')
    .description(
      'Show current readiness configuration (.claude/readiness.json merged with defaults)'
    )
    .option('-d, --dir <directory>', 'Target directory (default: cwd)')
    .action(opts => {
      try {
        const targetDir = path.resolve(opts.dir || process.cwd());
        const { loadConfig } = require('./readiness-config.cjs');
        const config = loadConfig(targetDir);
        process.stdout.write(JSON.stringify(config, null, 2) + '\n');
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  return program;
}

module.exports = {
  createReadinessCLI,
  runScore,
  runRemediate,
};
