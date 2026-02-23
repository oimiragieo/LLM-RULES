/**
 * Pure JSON output extractor for ask-claude.mjs.
 * When --json is used, Claude CLI returns structured JSON (--output-format json).
 * Exported for unit testing without spawning a process.
 */

/**
 * Extract the response text from Claude CLI's JSON stdout.
 * If the output has a `.response` field, returns its string value.
 * Otherwise throws to signal unexpected JSON envelope.
 *
 * @param {string} stdout - raw stdout from claude CLI (expected to be JSON when --json is used)
 * @returns {string} response text. Note: if .response is null, it returns an empty string.
 * @throws {SyntaxError} if stdout is not valid JSON
 * @throws {Error} if stdout JSON has no .response field
 */
export function extractJsonResponse(stdout) {
  const parsed = JSON.parse(stdout);
  if (parsed && typeof parsed === 'object' && 'response' in parsed) {
    // String(null ?? '') is ''
    return String(parsed.response ?? '');
  }
  throw new Error('Claude JSON output missing required .response field');
}
