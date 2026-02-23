'use strict';

/**
 * webmcp-browser-tools — post-execute hook
 *
 * Logs skill completion and browser-support status reminder.
 */

function postExecute(_input = {}, result = {}) {
  process.stderr.write(
    '[webmcp-browser-tools] Reminder: Chrome 146 Canary (Feb 2026) — ' +
      'use @mcp-b/webmcp-polyfill for cross-browser support today.\n',
  );
  return result;
}

module.exports = { postExecute };
