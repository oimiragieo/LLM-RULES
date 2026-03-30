'use strict';

/**
 * Output format contracts for headless execution.
 *
 * Supported formats:
 *   text           - Human-readable multiline output
 *   json           - Single JSON object with result, exitCode, tokensUsed, duration
 *   stream-json    - Newline-delimited JSON (NDJSON) — one line per event
 *   stream-jsonrpc - Newline-delimited JSON-RPC 2.0 notifications — one per event
 */

/** All supported output format names */
const SUPPORTED_FORMATS = ['text', 'json', 'stream-json', 'stream-jsonrpc'];

/**
 * Format an exec result as a human-readable multiline string.
 *
 * @param {object} result
 * @param {string} result.result      - The text output of the execution
 * @param {number} result.exitCode    - Process exit code (0 = success)
 * @param {number} result.tokensUsed  - Total tokens consumed
 * @param {number} result.duration    - Wall-clock duration in milliseconds
 * @returns {string}
 */
function formatText(result) {
  const { result: output = '', exitCode = 0, tokensUsed = 0, duration = 0 } = result;
  const lines = [
    'Result:',
    output,
    '',
    `Exit Code:   ${exitCode}`,
    `Tokens Used: ${tokensUsed}`,
    `Duration:    ${duration}ms`,
  ];
  return lines.join('\n');
}

/**
 * Format an exec result as a JSON string.
 * The JSON object contains exactly: result, exitCode, tokensUsed, duration.
 *
 * @param {object} result
 * @param {string} result.result
 * @param {number} result.exitCode
 * @param {number} result.tokensUsed
 * @param {number} result.duration
 * @returns {string}  Valid JSON string
 */
function formatJson(result) {
  const { result: output = '', exitCode = 0, tokensUsed = 0, duration = 0 } = result;
  return JSON.stringify({ result: output, exitCode, tokensUsed, duration });
}

/**
 * Format an array of events as newline-delimited JSON (NDJSON).
 * Each event is serialized to its own JSON line.
 *
 * @param {object[]} events - Array of event objects
 * @returns {string}  Newline-delimited JSON string
 */
function formatStreamJson(events) {
  if (!events || events.length === 0) {
    return '';
  }
  return events.map(event => JSON.stringify(event)).join('\n');
}

/**
 * Format an array of events as newline-delimited JSON-RPC 2.0 notifications.
 * Each notification has: jsonrpc, method, params — no id (notifications have no id).
 *
 * @param {object[]} events - Array of event objects
 * @returns {string}  Newline-delimited JSON-RPC 2.0 string
 */
function formatStreamJsonRpc(events) {
  if (!events || events.length === 0) {
    return '';
  }
  return events
    .map(event =>
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'exec/event',
        params: event,
      })
    )
    .join('\n');
}

/**
 * Dispatches to the correct formatter based on the configured format string.
 */
class OutputFormatter {
  /**
   * @param {string} format - One of: 'text', 'json', 'stream-json', 'stream-jsonrpc'
   * @throws {Error} If format is not supported
   */
  constructor(format) {
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new Error(
        `Unknown output format: "${format}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}.`
      );
    }
    this._format = format;
  }

  /**
   * Format data using the configured format.
   *
   * For 'text' and 'json': data should be a result object { result, exitCode, tokensUsed, duration }
   * For 'stream-json' and 'stream-jsonrpc': data should be an array of event objects
   *
   * @param {object|object[]} data
   * @returns {string}
   */
  format(data) {
    switch (this._format) {
      case 'text':
        return formatText(data);
      case 'json':
        return formatJson(data);
      case 'stream-json':
        return formatStreamJson(data);
      case 'stream-jsonrpc':
        return formatStreamJsonRpc(data);
      default:
        // Should never reach here due to constructor validation
        throw new Error(`Unknown output format: "${this._format}"`);
    }
  }
}

module.exports = {
  SUPPORTED_FORMATS,
  formatText,
  formatJson,
  formatStreamJson,
  formatStreamJsonRpc,
  OutputFormatter,
};
