/**
 * Pure JSON output formatter for ask-gemini.mjs.
 * Always returns a consistent JSON envelope when --json is used,
 * whether the Gemini response succeeded or failed to parse.
 * Exported for unit testing without spawning a process.
 */

/**
 * Format Gemini CLI stdout into a consistent JSON envelope.
 *
 * @param {string} stdout - raw stdout from gemini CLI (expected to be JSON)
 * @returns {{ output: string, exitCode: number, warning?: string }}
 *   output    - JSON string to write to stdout
 *   exitCode  - 0 on success, 1 on parse error
 *   warning   - optional message to write to stderr
 */
export function formatJsonOutput(stdout) {
  try {
    const data = JSON.parse(stdout);
    return {
      output: JSON.stringify({ response: data.response ?? '' }),
      exitCode: 0,
    };
  } catch (e) {
    const errMsg = e?.message ?? 'parse error';
    return {
      output: JSON.stringify({ error: errMsg, raw: stdout }),
      exitCode: 1,
      warning: `Warning: Gemini did not return valid JSON. (${errMsg})`,
    };
  }
}
