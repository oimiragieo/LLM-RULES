#!/usr/bin/env node
/**
 * Bootstrap System
 * ================
 *
 * Executes mission-level init.sh bootstrap idempotently.
 * Runs through component checks sequentially.
 * Writes bootstrap-state.json with component status.
 *
 * Features:
 * - Overall status: 'complete' (all ok), 'halted' (critical failure), 'error' (parse error)
 * - Critical component failure halts - subsequent components get 'skipped'
 * - Idempotent: re-run skips components already 'ok' in state file
 * - Partial failure retry: only re-attempts 'failed' and 'skipped' components
 * - Component timeout configurable (default 60s)
 * - Windows: uses 'where' instead of 'command -v' for binary detection
 * - Syntax errors caught and reported in state file
 *
 * @module bootstrap-system
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { isWindows } = require('../platform.cjs');
const { commandExists } = require('../utils/command-exists.cjs');

/**
 * Default timeout in milliseconds (60 seconds)
 */
const DEFAULT_TIMEOUT = 60000;

/**
 * Valid component statuses
 */
const COMPONENT_STATUSES = ['ok', 'failed', 'skipped', 'timeout', 'halted'];

/**
 * Valid overall statuses
 */
const OVERALL_STATUSES = ['complete', 'halted', 'error', 'partial'];

/**
 * BootstrapSystem class for idempotent bootstrap execution
 */
class BootstrapSystem {
  /**
   * Create a new BootstrapSystem instance
   * @param {Object} options - Configuration options
   * @param {string} options.initShPath - Path to init.sh script
   * @param {string} options.statePath - Path to bootstrap-state.json
   * @param {Array<Object>} options.components - Array of component definitions
   * @param {number} [options.timeout] - Default timeout in ms (default 60000)
   * @param {boolean} [options.skipInitSh] - Skip init.sh execution (for testing)
   */
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('Options object is required');
    }

    this.options = {
      initShPath: options.initShPath,
      statePath: options.statePath,
      components: options.components || [],
      timeout: options.timeout || DEFAULT_TIMEOUT,
      skipInitSh: options.skipInitSh || false,
    };

    this.previousState = null;
    this.state = {
      status: 'complete',
      components: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Load previous state file if it exists
   * @returns {Object|null} Previous state or null
   */
  loadPreviousState() {
    if (!fs.existsSync(this.options.statePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.options.statePath, 'utf8');
      return JSON.parse(content);
    } catch (_err) {
      // Corrupted state file - will be overwritten
      return null;
    }
  }

  /**
   * Check if a component should be skipped (already ok and binary still exists)
   * @param {Object} component - Component definition
   * @param {Object} previousComponent - Previous component state
   * @returns {boolean} True if should skip
   */
  shouldSkipComponent(component, previousComponent) {
    if (!previousComponent || previousComponent.status !== 'ok') {
      return false;
    }

    // Check if binary still exists (if binary specified)
    if (component.binary) {
      return commandExists(component.binary);
    }

    // No binary to check - skip if previously ok
    return true;
  }

  /**
   * Check a single component
   * @param {Object} component - Component definition
   * @param {number} defaultTimeout - Default timeout in ms
   * @returns {Object} Component result
   */
  checkComponent(component, defaultTimeout) {
    const timeout = component.timeout || defaultTimeout;
    const result = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      reason: null,
    };

    try {
      const checkCmd = component.check;
      if (!checkCmd) {
        result.status = 'failed';
        result.reason = 'No check command defined';
        return result;
      }

      // Execute the check command
      const execResult = this.executeCommand(checkCmd, timeout);

      if (execResult.timedOut) {
        result.status = 'timeout';
        result.reason = `Command timed out after ${timeout}ms`;
      } else if (execResult.error) {
        result.status = 'failed';
        result.reason = execResult.error.message || 'Command failed';
      } else if (execResult.code !== 0) {
        result.status = 'failed';
        result.reason = `Command exited with code ${execResult.code}`;
      }

      // If binary specified, also verify binary exists
      if (result.status === 'ok' && component.binary) {
        if (!commandExists(component.binary)) {
          result.status = 'failed';
          result.reason = `Binary '${component.binary}' not found`;
        }
      }
    } catch (err) {
      result.status = 'failed';
      result.reason = err.message || 'Unknown error';
    }

    return result;
  }

  /**
   * Execute a command with timeout
   * @param {string} command - Command to execute
   * @param {number} timeout - Timeout in ms
   * @returns {Object} Execution result
   */
  executeCommand(command, timeout) {
    const shell = isWindows ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    try {
      const result = childProcess.spawnSync(shell, [shellFlag, command], {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Check for timeout - spawnSync kills the process and returns SIGKILL signal
      // On Windows, there's no signal, but status will be null and error may be set
      if (result.signal === 'SIGKILL' || (result.error && result.error.code === 'ETIMEDOUT')) {
        return { timedOut: true, error: null, code: null };
      }

      // On Windows, timeout may result in status 1 with specific error
      if (result.status === null && result.error) {
        // Could be timeout or other error
        return {
          timedOut: false,
          error: result.error,
          code: null,
          stdout: result.stdout ? result.stdout.toString() : '',
          stderr: result.stderr ? result.stderr.toString() : '',
        };
      }

      return {
        timedOut: false,
        error: result.error,
        code: result.status,
        stdout: result.stdout ? result.stdout.toString() : '',
        stderr: result.stderr ? result.stderr.toString() : '',
      };
    } catch (err) {
      return {
        timedOut: false,
        error: err,
        code: null,
      };
    }
  }

  /**
   * Execute init.sh script
   * @returns {Object} Execution result
   */
  executeInitSh() {
    const initShPath = this.options.initShPath;

    // Check if init.sh exists
    if (!fs.existsSync(initShPath)) {
      return {
        error: new Error(`init.sh not found at ${initShPath}`),
        code: null,
        timedOut: false,
      };
    }

    const timeout = this.options.timeout;

    try {
      // On Windows with bash (Git Bash), we need to convert backslashes to forward slashes
      // because bash interprets backslashes as escape characters
      let bashPath = initShPath;
      if (isWindows && commandExists('bash')) {
        // Convert Windows path to Unix-style path for bash
        bashPath = initShPath.replace(/\\/g, '/');
      }

      // On Windows, we need to use bash if available, or the script directly
      let command;
      if (isWindows) {
        // Try to use bash (Git Bash, WSL, etc.)
        if (commandExists('bash')) {
          command = `bash "${bashPath}"`;
        } else {
          // Fall back to running directly (may work if .sh is associated)
          command = `"${initShPath}"`;
        }
      } else {
        // Unix: run with bash
        command = `bash "${initShPath}"`;
      }

      return this.executeCommand(command, timeout);
    } catch (_err) {
      return {
        error: _err,
        code: null,
        timedOut: false,
      };
    }
  }

  /**
   * Write state file atomically
   */
  writeState() {
    const statePath = this.options.statePath;
    const tmpPath = statePath + '.tmp';

    try {
      // Ensure directory exists
      const dir = path.dirname(statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temp file
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');

      // Rename to final path (atomic on most systems)
      fs.renameSync(tmpPath, statePath);
    } catch (_err) {
      // If rename fails, try direct write
      try {
        fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2), 'utf8');
      } catch (_writeErr) {
        // Last resort - ignore
      }
    }
  }

  /**
   * Run the bootstrap process
   * @returns {Object} Bootstrap result
   */
  run() {
    // Load previous state
    this.previousState = this.loadPreviousState();

    // Initialize state
    this.state = {
      status: 'complete',
      components: {},
      timestamp: new Date().toISOString(),
      error: null,
    };

    // Check if init.sh exists (unless skipped)
    if (!this.options.skipInitSh) {
      if (!fs.existsSync(this.options.initShPath)) {
        this.state.status = 'error';
        this.state.error = `init.sh not found at ${this.options.initShPath}`;
        this.writeState();
        return this.state;
      }

      // Execute init.sh first
      const initResult = this.executeInitSh();

      if (initResult.timedOut) {
        this.state.status = 'halted';
        this.state.error = `init.sh timed out after ${this.options.timeout}ms`;
        this.writeState();
        return this.state;
      }

      // Check for init.sh execution error or non-zero exit code
      if (initResult.error) {
        this.state.status = 'error';
        this.state.error = initResult.error.message || 'init.sh execution failed';
        this.writeState();
        return this.state;
      }

      // If init.sh exited with non-zero code, that's a critical failure
      if (initResult.code !== 0) {
        this.state.status = 'halted';
        this.state.error = `init.sh exited with code ${initResult.code}`;
        // Check stderr for syntax error details
        if (initResult.stderr) {
          const stderr = initResult.stderr.toLowerCase();
          if (stderr.includes('syntax error') || stderr.includes('unexpected')) {
            this.state.status = 'error';
            this.state.error = `Syntax error in init.sh: ${initResult.stderr.trim().split('\n')[0]}`;
          }
        }
        this.writeState();
        return this.state;
      }
    }

    // Process each component sequentially
    let halted = false;
    const components = this.options.components;

    for (const component of components) {
      const name = component.name;

      if (halted) {
        // Mark subsequent components as skipped
        this.state.components[name] = {
          status: 'skipped',
          timestamp: new Date().toISOString(),
          reason: 'Skipped due to previous critical failure',
        };
        continue;
      }

      // Check if we should skip this component (idempotency)
      if (this.previousState && this.previousState.components && this.previousState.components[name]) {
        const prevComp = this.previousState.components[name];

        // Skip if previously ok and binary still exists
        if (this.shouldSkipComponent(component, prevComp)) {
          this.state.components[name] = prevComp;
          continue;
        }

        // Re-verify if previously ok but binary check fails
        if (prevComp.status === 'ok') {
          const result = this.checkComponent(component, this.options.timeout);
          this.state.components[name] = result;
          if (result.status !== 'ok' && component.critical) {
            halted = true;
            this.state.status = 'halted';
          }
          continue;
        }

        // Re-attempt if previously failed or skipped
        if (prevComp.status === 'failed' || prevComp.status === 'skipped' || prevComp.status === 'timeout') {
          const result = this.checkComponent(component, this.options.timeout);
          this.state.components[name] = result;
          if (result.status !== 'ok' && component.critical) {
            halted = true;
            this.state.status = 'halted';
          }
          continue;
        }
      }

      // Fresh check
      const result = this.checkComponent(component, this.options.timeout);
      this.state.components[name] = result;

      if (result.status !== 'ok' && component.critical) {
        halted = true;
        this.state.status = 'halted';
      }
    }

    // Determine final status
    // 'complete' = bootstrap ran successfully, no critical failures (non-critical failures are ok)
    // 'halted' = critical failure stopped the process
    // 'error' = parse/syntax error
    if (!halted && this.state.status !== 'halted') {
      this.state.status = 'complete';
    }

    this.writeState();
    return this.state;
  }
}

module.exports = {
  BootstrapSystem,
  DEFAULT_TIMEOUT,
  COMPONENT_STATUSES,
  OVERALL_STATUSES,
};
