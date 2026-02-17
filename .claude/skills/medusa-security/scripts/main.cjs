'use strict';

const path = require('path');
const { runMedusaScan } = require(path.join(__dirname, 'cli-wrapper.cjs'));
const { generateSummary, generateMarkdownReport } = require(
  path.join(__dirname, 'finding-formatter.cjs')
);

/**
 * Scan modes map to CLI options.
 */
const MODE_OPTIONS = {
  full: {},
  'ai-only': { aiOnly: true },
  quick: { quick: true },
  targeted: {},
};

/**
 * Run a Medusa security scan with the given options.
 *
 * @param {object} options - Scan options
 * @param {string} [options.mode='full'] - Scan mode: full, ai-only, quick, targeted
 * @param {string} [options.target='.'] - Target path to scan
 * @param {string[]} [options.scanners] - Scanners for targeted mode
 * @param {string} [options.failOn] - Severity threshold for non-zero exit
 * @param {string} [options.format='sarif'] - Output format (sarif or json)
 * @param {string[]} [options.exclude] - Paths to exclude
 * @returns {{ findings: Array, summary: object, report: string, exitCode: number }}
 */
function runScan(options) {
  const mode = options.mode || 'full';
  const target = options.target || '.';

  // Build CLI options from mode
  const modeOpts = MODE_OPTIONS[mode] || {};
  const cliOptions = {
    ...modeOpts,
  };

  // Pass through format, failOn, exclude
  if (options.format) {
    cliOptions.format = options.format;
  }
  if (options.failOn) {
    cliOptions.failOn = options.failOn;
  }
  if (options.exclude) {
    cliOptions.exclude = options.exclude;
  }

  // Targeted mode uses specific scanners
  if (mode === 'targeted' && options.scanners) {
    cliOptions.scanners = options.scanners;
  }

  // Run the scan via CLI wrapper
  const scanResult = runMedusaScan(target, cliOptions);

  // Generate summary and report from findings
  const summary = generateSummary(scanResult.findings);
  const report = generateMarkdownReport(scanResult.findings);

  return {
    findings: scanResult.findings,
    summary,
    report,
    exitCode: scanResult.exitCode,
  };
}

module.exports = {
  runScan,
};
