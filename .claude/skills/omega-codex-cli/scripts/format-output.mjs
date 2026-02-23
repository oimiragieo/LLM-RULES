/**
 * Helpers for codex JSON output handling.
 */

/**
 * Extract final message text from the last JSONL event that contains a text payload.
 * Codex `exec --json` streams events, one JSON object per line.
 *
 * @param {string} stdout - raw JSONL from codex exec --json
 * @returns {string}
 */
export function extractFinalMessageFromJsonl(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const text =
      parsed?.text ??
      parsed?.response?.text ??
      parsed?.content?.[0]?.text ??
      parsed?.message?.content?.[0]?.text;
    if (typeof text === 'string' && text.length > 0) {
      return text;
    }
  }
  return '';
}
