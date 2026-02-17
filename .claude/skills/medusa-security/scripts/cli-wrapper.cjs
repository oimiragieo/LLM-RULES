'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { safeParseJSON } = require(
  path.join(__dirname, '..', '..', '..', 'lib', 'utils', 'safe-json.cjs')
);
const { parseSarif } = require(path.join(__dirname, 'sarif-parser.cjs'));
const { parseMedusaJson } = require(path.join(__dirname, 'json-parser.cjs'));

/**
 * Injectable spawnSync for testing. Tests replace this via _spawnSync.
 * @type {Function}
 */
let _spawnSync = spawnSync;

/**
 * Build command-line arguments for medusa scan.
 * @param {object} options - Scan options
 * @param {string} options.target - Target path to scan
 * @param {string} [options.format='sarif'] - Output format (sarif or json)
 * @param {boolean} [options.aiOnly=false] - Scan AI-specific patterns only
 * @param {boolean} [options.quick=false] - Quick scan mode
 * @param {string[]} [options.scanners] - Specific scanners to run
 * @param {string} [options.failOn] - Severity threshold for non-zero exit
 * @param {string[]} [options.exclude] - Paths to exclude
 * @returns {string[]} Array of CLI arguments
 */
function buildScanArgs(options) {
  const args = ['scan', options.target];

  const format = options.format || 'sarif';
  args.push('--format', format);

  if (options.aiOnly) {
    args.push('--ai-only');
  }

  if (options.quick) {
    args.push('--quick');
  }

  if (options.scanners && options.scanners.length > 0) {
    args.push('--scanners', options.scanners.join(','));
  }

  if (options.failOn) {
    args.push('--fail-on', options.failOn);
  }

  if (options.exclude && options.exclude.length > 0) {
    for (const excl of options.exclude) {
      args.push('-e', excl);
    }
  }

  return args;
}

/**
 * Check if medusa-security is installed.
 * @returns {{ installed: boolean, version: string|null, error?: string }}
 */
function checkInstallation() {
  try {
    const result = _spawnSync('python', ['-m', 'medusa', '--version'], {
      shell: false,
      timeout: 10000,
      encoding: 'utf-8',
    });

    if (result.status === 0) {
      const stdout = result.stdout instanceof Buffer ? result.stdout.toString() : result.stdout;
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : null,
      };
    }

    const stderr = result.stderr instanceof Buffer ? result.stderr.toString() : result.stderr;
    return {
      installed: false,
      version: null,
      error: stderr || 'medusa-security not found',
    };
  } catch (err) {
    return {
      installed: false,
      version: null,
      error: err.message,
    };
  }
}

/**
 * Run a medusa scan on the target path.
 * @param {string} target - Path to scan
 * @param {object} [options={}] - Scan options
 * @returns {{ exitCode: number, findings: Array, raw: string }}
 */
function runMedusaScan(target, options) {
  const opts = { target, ...options };
  const scanArgs = buildScanArgs(opts);
  const format = opts.format || 'sarif';

  const result = _spawnSync('python', ['-m', 'medusa', ...scanArgs], {
    shell: false,
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
  });

  const stdout = result.stdout instanceof Buffer ? result.stdout.toString() : result.stdout || '';
  const exitCode = result.status || 0;

  let findings = [];
  if (stdout.trim()) {
    if (format === 'sarif') {
      const sarifData = safeParseJSON(stdout);
      const parsed = parseSarif(sarifData);
      findings = Array.isArray(parsed) ? parsed : parsed.findings || [];
    } else {
      const jsonData = safeParseJSON(stdout);
      findings = parseMedusaJson(jsonData);
    }
  }

  return {
    exitCode,
    findings,
    raw: stdout,
  };
}

module.exports = {
  buildScanArgs,
  checkInstallation,
  runMedusaScan,
  // Expose for test injection
  get _spawnSync() {
    return _spawnSync;
  },
  set _spawnSync(fn) {
    _spawnSync = fn;
  },
};
