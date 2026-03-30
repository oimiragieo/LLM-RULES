'use strict';

const fs = require('fs');

const { PermissionEnforcer, PermissionViolationError } = require('./autonomy.cjs');
const { OutputFormatter } = require('./output-formatter.cjs');

// ---------------------------------------------------------------------------
// ExecEngine
// ---------------------------------------------------------------------------

/**
 * Headless execution engine for one-shot prompt processing.
 *
 * Wraps a (real or mock) LLM runner with:
 *   - Autonomy-tier-based tool permission enforcement
 *   - Structured output formatting
 *   - Working-directory override
 *   - Optional tool enable/disable overrides
 */
class ExecEngine {
  /**
   * @param {object}   [options]
   * @param {string}   [options.tier='readOnly']     - Autonomy tier name
   * @param {string}   [options.outputFormat='text'] - One of text | json | stream-json | stream-jsonrpc
   * @param {string}   [options.model]               - Model identifier forwarded to the LLM runner
   * @param {string}   [options.reasoningEffort]     - Reasoning-effort hint forwarded to the LLM runner
   * @param {string}   [options.cwd]                 - Override working directory for the run
   * @param {string[]} [options.enabledTools]        - Tools explicitly allowed (additive over tier)
   * @param {string[]} [options.disabledTools]       - Tools explicitly blocked (takes priority)
   * @param {Function} [options._processPrompt]      - Injectable LLM runner (for testing / mocking)
   *   Signature: async (prompt: string, ctx: { toolInterceptor: (toolName: string) => void }) => { result: string, tokensUsed: number }
   */
  constructor({
    tier = 'readOnly',
    outputFormat = 'text',
    model,
    reasoningEffort,
    cwd,
    enabledTools,
    disabledTools,
    _processPrompt,
  } = {}) {
    // Validate tier and format eagerly so misconfigured engines fail at construction time.
    // PermissionEnforcer and OutputFormatter both throw on unknown values.
    this._enforcer = new PermissionEnforcer(tier);
    this._formatter = new OutputFormatter(outputFormat);

    this.tier = tier;
    this.outputFormat = outputFormat;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.cwd = cwd;
    this.enabledTools = enabledTools || null;
    this.disabledTools = disabledTools || null;

    this._processPromptFn = _processPrompt || _defaultProcessPrompt;
  }

  /**
   * Run a prompt through the execution engine.
   *
   * Steps:
   *   1. Creates a PermissionEnforcer for the configured tier.
   *   2. Builds a tool interceptor that enforces permissions before each tool call.
   *   3. Optionally changes cwd, then invokes the LLM runner.
   *   4. Returns { result, exitCode, tokensUsed, duration, formatted } on success.
   *   5. Returns { result, exitCode:1, tokensUsed, duration, error, formatted } on permission violation.
   *
   * @param {string} prompt
   * @returns {Promise<{
   *   result: string,
   *   exitCode: number,
   *   tokensUsed: number,
   *   duration: number,
   *   formatted: string,
   *   error?: { type: string, toolName: string, currentTier: string, requiredTier: string }
   * }>}
   */
  async run(prompt) {
    const start = Date.now();
    const enforcer = new PermissionEnforcer(this.tier);
    const formatter = this._formatter;
    const { enabledTools, disabledTools, tier } = this;

    // Tool interceptor: called before each tool use inside the LLM runner.
    const toolInterceptor = toolName => {
      // Explicit disable takes highest priority.
      if (disabledTools && disabledTools.includes(toolName)) {
        throw new PermissionViolationError({
          toolName,
          currentTier: tier,
          requiredTier: 'never (explicitly disabled)',
        });
      }
      // Explicit enable bypasses tier-level enforcement.
      if (enabledTools && enabledTools.includes(toolName)) {
        return;
      }
      // Fall back to tier-based enforcement.
      enforcer.enforce(toolName);
    };

    // Optionally change working directory.
    const originalCwd = process.cwd();
    if (this.cwd) {
      process.chdir(this.cwd);
    }

    try {
      const llmResult = await this._processPromptFn(prompt, { toolInterceptor });
      const duration = Date.now() - start;

      const execResult = {
        result: llmResult.result != null ? llmResult.result : '',
        exitCode: 0,
        tokensUsed: llmResult.tokensUsed != null ? llmResult.tokensUsed : 0,
        duration,
      };

      return {
        ...execResult,
        formatted: formatter.format(execResult),
      };
    } catch (err) {
      const duration = Date.now() - start;

      if (err instanceof PermissionViolationError) {
        const execResult = {
          result: err.message,
          exitCode: 1,
          tokensUsed: 0,
          duration,
        };
        return {
          ...execResult,
          error: {
            type: 'PermissionViolationError',
            toolName: err.toolName,
            currentTier: err.currentTier,
            requiredTier: err.requiredTier,
          },
          formatted: formatter.format(execResult),
        };
      }

      // Unknown error: re-throw so callers can handle it.
      throw err;
    } finally {
      // Always restore the original working directory.
      if (this.cwd) {
        try {
          process.chdir(originalCwd);
        } catch (_) {
          // Ignore chdir restore errors; original cwd may have been deleted.
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Default (stub) LLM runner
// ---------------------------------------------------------------------------

/**
 * Stub LLM runner used when no _processPrompt is injected.
 * In production this would be replaced by the real SDK call.
 *
 * @param {string}   prompt
 * @param {object}   ctx
 * @param {Function} ctx.toolInterceptor
 * @returns {Promise<{ result: string, tokensUsed: number }>}
 */
async function _defaultProcessPrompt(prompt, { toolInterceptor }) {
  void toolInterceptor; // Available but not used by the stub.
  return {
    result: `Processed: ${prompt}`,
    tokensUsed: 0,
  };
}

// ---------------------------------------------------------------------------
// parseExecFlags
// ---------------------------------------------------------------------------

/**
 * Parse a CLI argv array into a structured flags object.
 *
 * Supported flags:
 *   -m <model>                     → { model }
 *   -r <reasoning>                 → { reasoningEffort }
 *   -f <file>                      → { promptFile }
 *   -s <session>                   → { session }
 *   --auto <tier>                  → { auto }
 *   --output <format>              → { output }
 *   --cwd <dir>                    → { cwd }
 *   --enabled-tools <a,b,c>        → { enabledTools: ['a','b','c'] }
 *   --disabled-tools <a,b,c>       → { disabledTools: ['a','b','c'] }
 *   --skip-permissions-unsafe      → { auto: 'skipPermissions' }
 *   <positional>                   → { prompt }
 *
 * @param {string[]} argv
 * @returns {object}
 */
function parseExecFlags(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-m' && i + 1 < argv.length) {
      result.model = argv[++i];
    } else if (arg === '-r' && i + 1 < argv.length) {
      result.reasoningEffort = argv[++i];
    } else if (arg === '-f' && i + 1 < argv.length) {
      result.promptFile = argv[++i];
    } else if (arg === '-s' && i + 1 < argv.length) {
      result.session = argv[++i];
    } else if (arg === '--auto' && i + 1 < argv.length) {
      result.auto = argv[++i];
    } else if (arg === '--output' && i + 1 < argv.length) {
      result.output = argv[++i];
    } else if (arg === '--cwd' && i + 1 < argv.length) {
      result.cwd = argv[++i];
    } else if (arg === '--enabled-tools' && i + 1 < argv.length) {
      result.enabledTools = argv[++i]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (arg === '--disabled-tools' && i + 1 < argv.length) {
      result.disabledTools = argv[++i]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (arg === '--skip-permissions-unsafe') {
      result.auto = 'skipPermissions';
    } else if (!arg.startsWith('-')) {
      // First positional argument is treated as the inline prompt.
      result.prompt = arg;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// readPromptFromFile
// ---------------------------------------------------------------------------

/**
 * Read prompt text from a file path (synchronous).
 * Throws an ENOENT error if the file does not exist.
 *
 * @param {string} filePath - Absolute or relative path to the prompt file
 * @returns {string} File contents as UTF-8 string
 */
function readPromptFromFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ExecEngine,
  parseExecFlags,
  readPromptFromFile,
};
