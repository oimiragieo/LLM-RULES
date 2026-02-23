'use strict';

/**
 * webmcp-browser-tools — pre-execute hook
 *
 * Validates that the invocation context is appropriate for WebMCP guidance.
 * Warns if the caller appears to want web scraping (wrong tool) vs. exposing
 * web app functionality to agents (correct tool).
 */

const SCRAPING_SIGNALS = ['scrape', 'crawl', 'fetch external', 'download page', 'parse html'];

function preExecute(input = {}) {
  const args = (input.args || '').toLowerCase();
  const query = (input.query || '').toLowerCase();
  const combined = `${args} ${query}`;

  for (const signal of SCRAPING_SIGNALS) {
    if (combined.includes(signal)) {
      process.stderr.write(
        `[webmcp-browser-tools] WARNING: Input contains "${signal}" — ` +
          'WebMCP exposes web app functionality TO agents; it does not scrape external pages. ' +
          'Use WebFetch or mcp__Exa__web_search_exa for fetching external content.\n'
      );
    }
  }

  return { continue: true };
}

module.exports = { preExecute };
