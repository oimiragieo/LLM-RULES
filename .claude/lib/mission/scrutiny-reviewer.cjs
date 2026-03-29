'use strict';

/**
 * Scrutiny Reviewer
 *
 * Auto-spawns read-only reviewer after worker completion.
 * Triggered by worker TaskUpdate status:'completed'.
 *
 * Reviewer receives featureId, verificationSteps from features.json, and test command.
 * Executes verification steps sequentially, captures exit code and output per step.
 * Produces structured JSON verdict: {verdict:'approved'|'rejected', featureId, timestamp, steps[], failures[], summary}.
 * Verdict schema validated by AJV.
 *
 * Reviewer crash (unhandled exception, timeout) produces synthetic rejected verdict with {crash:true, error}.
 * Read-only enforcement: spawn config includes permissionMode:'read-only'.
 * Destructive commands in verificationSteps filtered and recorded as skippedDestructive.
 *
 * Per-step timeout configurable (default 30s), overall timeout 5 minutes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Default timeouts
const DEFAULT_STEP_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_OVERALL_TIMEOUT_MS = 300000; // 5 minutes

// Destructive command patterns (commands that modify files)
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-/, // rm -rf, rm -r, etc.
  /\brm\s+/i, // rm (any form)
  /\bdel\s+/i, // Windows del
  /\brmdir\s+/i, // rmdir
  /\bmv\s+.*\s+.*\/dev\/null/i, // mv to /dev/null
  /\bdd\s+if=/i, // dd (disk operations)
  /\bformat\s+/i, // format
  /\bshred\s+/i, // shred
  /\btruncate\s+--size=0/i, // truncate to zero
  />\s*\/dev\/(null|zero|urandom)/, // redirect to destructive devices
  /:(){ :|:& };:/, // Fork bomb
];

/**
 * Filter out destructive commands from verification steps
 *
 * @param {string[]} steps - Array of verification commands
 * @returns {{ safeSteps: string[], skippedDestructive: string[] }}
 */
function filterDestructiveCommands(steps) {
  const safeSteps = [];
  const skippedDestructive = [];

  for (const step of steps) {
    const isDestructive = DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(step));

    if (isDestructive) {
      skippedDestructive.push(step);
    } else {
      safeSteps.push(step);
    }
  }

  return { safeSteps, skippedDestructive };
}

/**
 * Execute a single verification step
 *
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ exitCode: number | string, output: string, error?: string }>}
 */
function executeVerificationStep(command, options = {}) {
  const { timeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;

  return new Promise(resolve => {
    let output = '';
    let errorOutput = '';
    let timedOut = false;

    // Determine shell based on platform
    const isWindows = process.platform === 'win32';

    // On Windows, use cmd.exe with /c to properly handle commands
    // On Unix, use bash
    let spawnOptions;
    let actualCommand;

    if (isWindows) {
      // Use cmd.exe for Windows to properly handle exit, echo, etc.
      actualCommand = process.env.ComSpec || 'cmd.exe';
      spawnOptions = {
        cwd: process.cwd(),
        env: { ...process.env },
        windowsVerbatimArguments: true,
      };
    } else {
      actualCommand = '/bin/bash';
      spawnOptions = {
        cwd: process.cwd(),
        env: { ...process.env },
      };
    }

    // Spawn the process
    const args = isWindows ? ['/s', '/c', command] : ['-c', command];
    const child = spawn(actualCommand, args, spawnOptions);

    // Capture stdout
    child.stdout.on('data', data => {
      output += data.toString();
    });

    // Capture stderr
    child.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    // Set timeout handler before event handlers
    const timeoutId = setTimeout(() => {
      timedOut = true;
      // On Windows, use taskkill for forceful termination
      if (isWindows) {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    // Handle process close
    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          exitCode: 'TIMEOUT',
          output: output + errorOutput,
          error: `Command timed out after ${timeoutMs}ms`,
        });
      } else if (signal) {
        resolve({
          exitCode: signal,
          output: output + errorOutput,
          error: `Process killed with signal ${signal}`,
        });
      } else {
        resolve({
          exitCode: code ?? 1,
          output: output + errorOutput,
          error: errorOutput || undefined,
        });
      }
    });

    // Handle spawn errors
    child.on('error', err => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: 'ERROR',
        output: '',
        error: err.message,
      });
    });
  });
}

/**
 * Create the AJV schema for verdict validation
 *
 * @returns {Object} - JSON Schema object
 */
function createVerdictSchema() {
  return {
    type: 'object',
    required: ['verdict', 'featureId', 'timestamp', 'steps', 'failures', 'summary'],
    properties: {
      verdict: {
        type: 'string',
        enum: ['approved', 'rejected'],
      },
      featureId: {
        type: 'string',
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          required: ['command', 'exitCode', 'output'],
          properties: {
            command: { type: 'string' },
            exitCode: { type: ['number', 'string'] },
            output: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
      failures: {
        type: 'array',
        items: {
          type: 'object',
          required: ['step', 'exitCode'],
          properties: {
            step: { type: 'string' },
            exitCode: { type: ['number', 'string'] },
            error: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
      crash: { type: 'boolean' },
      timeout: { type: 'boolean' },
      error: { type: 'string' },
      skippedDestructive: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    additionalProperties: true,
  };
}

/**
 * Validate a verdict against the schema
 *
 * @param {Object} verdict - Verdict object to validate
 * @returns {{ valid: boolean, errors?: Array }}
 */
function validateVerdict(verdict) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv); // Add date-time and other formats
  const schema = createVerdictSchema();
  const validate = ajv.compile(schema);

  const valid = validate(verdict);

  return {
    valid,
    errors: valid ? undefined : validate.errors,
  };
}

/**
 * Scrutiny Reviewer class
 */
class ScrutinyReviewer {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.featureId - Feature ID being reviewed
   * @param {string} options.featuresPath - Path to features.json
   * @param {string[]} options.verificationSteps - Array of verification commands
   * @param {string} options.missionDir - Mission workspace directory
   * @param {number} [options.stepTimeoutMs] - Per-step timeout (default 30s)
   * @param {number} [options.overallTimeoutMs] - Overall timeout (default 5 min)
   * @param {boolean} [options.failFast] - Stop on first failure (default true)
   */
  constructor(options) {
    this.featureId = options.featureId;
    this.featuresPath = options.featuresPath ? path.normalize(options.featuresPath) : null;
    this.verificationSteps = options.verificationSteps || [];
    this.missionDir = path.normalize(options.missionDir);
    this.stepTimeoutMs = options.stepTimeoutMs || DEFAULT_STEP_TIMEOUT_MS;
    this.overallTimeoutMs = options.overallTimeoutMs || DEFAULT_OVERALL_TIMEOUT_MS;
    this.failFast = options.failFast !== false; // Default true

    // Read-only enforcement
    this.permissionMode = 'read-only';

    // Filter destructive commands
    const { safeSteps, skippedDestructive } = filterDestructiveCommands(this.verificationSteps);
    this.safeSteps = safeSteps;
    this.skippedDestructive = skippedDestructive;

    // Track execution
    this.startTime = null;
    this.steps = [];
    this.failures = [];
  }

  /**
   * Get spawn configuration for read-only enforcement
   * @returns {Object} - Spawn configuration
   */
  getSpawnConfig() {
    return {
      permissionMode: this.permissionMode,
      featureId: this.featureId,
      verificationSteps: this.safeSteps,
    };
  }

  /**
   * Create a synthetic verdict for reviewer crash
   *
   * @param {Error} error - The crash error
   * @returns {Object} - Synthetic rejected verdict
   */
  createCrashVerdict(error) {
    return {
      verdict: 'rejected',
      featureId: this.featureId,
      timestamp: new Date().toISOString(),
      steps: this.steps,
      failures: this.failures,
      summary: `Reviewer crashed: ${error.message}`,
      crash: true,
      error: `${error.message}${error.code ? ` (code: ${error.code})` : ''}`,
      skippedDestructive: this.skippedDestructive,
    };
  }

  /**
   * Create a synthetic verdict for overall timeout
   *
   * @returns {Object} - Synthetic rejected verdict
   */
  createTimeoutVerdict() {
    return {
      verdict: 'rejected',
      featureId: this.featureId,
      timestamp: new Date().toISOString(),
      steps: this.steps,
      failures: this.failures,
      summary: `Reviewer timed out after ${this.overallTimeoutMs}ms`,
      timeout: true,
      error: `Overall timeout of ${this.overallTimeoutMs}ms exceeded`,
      skippedDestructive: this.skippedDestructive,
    };
  }

  /**
   * Run all verification steps and produce a verdict
   *
   * @returns {Promise<Object>} - Verdict object
   */
  async run() {
    this.startTime = Date.now();
    this.steps = [];
    this.failures = [];

    // Track overall timeout using AbortController pattern
    let timeoutError = null;
    const overallTimeoutId = setTimeout(() => {
      timeoutError = new Error(`Overall timeout of ${this.overallTimeoutMs}ms exceeded`);
    }, this.overallTimeoutMs);

    try {
      // Execute each verification step sequentially
      for (const command of this.safeSteps) {
        // Check for timeout triggered by setTimeout
        if (timeoutError) {
          clearTimeout(overallTimeoutId);
          return this.createTimeoutVerdict();
        }

        // Check overall timeout before each step
        if (Date.now() - this.startTime > this.overallTimeoutMs) {
          clearTimeout(overallTimeoutId);
          return this.createTimeoutVerdict();
        }

        // Execute the step
        const result = await executeVerificationStep(command, {
          timeoutMs: this.stepTimeoutMs,
        });

        // Record the step
        this.steps.push({
          command,
          exitCode: result.exitCode,
          output: result.output,
          error: result.error,
        });

        // Track failures
        if (result.exitCode !== 0 && result.exitCode !== 'TIMEOUT') {
          this.failures.push({
            step: command,
            exitCode: result.exitCode,
            error: result.error,
          });

          // Stop on first failure if failFast
          if (this.failFast) {
            break;
          }
        }

        // Handle timeout as failure
        if (result.exitCode === 'TIMEOUT') {
          this.failures.push({
            step: command,
            exitCode: 'TIMEOUT',
            error: result.error,
          });

          if (this.failFast) {
            break;
          }
        }
      }

      clearTimeout(overallTimeoutId);

      // Check if timeout occurred during execution
      if (timeoutError) {
        return this.createTimeoutVerdict();
      }

      // Build verdict
      const verdict = this.failures.length === 0 ? 'approved' : 'rejected';
      const summary = this.buildSummary(verdict);

      const result = {
        verdict,
        featureId: this.featureId,
        timestamp: new Date().toISOString(),
        steps: this.steps,
        failures: this.failures,
        summary,
        skippedDestructive: this.skippedDestructive,
      };

      // Validate verdict
      const validation = validateVerdict(result);
      if (!validation.valid) {
        console.error('Verdict validation failed:', validation.errors);
        // Still return the verdict, but log the validation error
      }

      // Persist verdict
      await this.persistVerdict(result);

      return result;
    } catch (error) {
      clearTimeout(overallTimeoutId);

      // Handle crash
      const crashVerdict = this.createCrashVerdict(error);
      await this.persistVerdict(crashVerdict);

      return crashVerdict;
    }
  }

  /**
   * Build a summary string for the verdict
   *
   * @param {string} verdict - 'approved' or 'rejected'
   * @returns {string} - Summary string
   */
  buildSummary(verdict) {
    const totalSteps = this.steps.length;
    const failedSteps = this.failures.length;

    if (verdict === 'approved') {
      return `All ${totalSteps} verification steps passed for feature ${this.featureId}`;
    }

    return `${failedSteps}/${totalSteps} verification steps failed for feature ${this.featureId}`;
  }

  /**
   * Persist verdict to mission directory
   *
   * @param {Object} verdict - Verdict to persist
   */
  async persistVerdict(verdict) {
    const verdictsDir = path.join(this.missionDir, 'verdicts');

    // Ensure directory exists
    if (!fs.existsSync(verdictsDir)) {
      fs.mkdirSync(verdictsDir, { recursive: true });
    }

    // Create verdict file with timestamp
    const timestamp = Date.now();
    const filename = `${timestamp}-${this.featureId}.json`;
    const verdictPath = path.join(verdictsDir, filename);

    // Atomic write
    const tmpPath = verdictPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(verdict, null, 2));
    fs.renameSync(tmpPath, verdictPath);
  }
}

/**
 * Convenience function to create a ScrutinyReviewer
 *
 * @param {Object} options - Configuration options
 * @returns {ScrutinyReviewer}
 */
function createReviewer(options) {
  return new ScrutinyReviewer(options);
}

/**
 * Convenience function to spawn a reviewer and run verification
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Verdict object
 */
async function spawnReviewer(options) {
  const reviewer = createReviewer(options);
  return reviewer.run();
}

module.exports = {
  ScrutinyReviewer,
  createReviewer,
  spawnReviewer,
  executeVerificationStep,
  filterDestructiveCommands,
  createVerdictSchema,
  validateVerdict,
  DEFAULT_STEP_TIMEOUT_MS,
  DEFAULT_OVERALL_TIMEOUT_MS,
  DESTRUCTIVE_PATTERNS,
};
