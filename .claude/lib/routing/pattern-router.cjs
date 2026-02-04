'use strict';

/**
 * Resolve agent from prompt using regex patterns and priority.
 * @param {string} prompt - Normalized prompt (e.g. lowercase or trimmed).
 * @param {Record<string, Array<{ pattern: RegExp, priority: number }>>} patterns
 * @returns {{ agent: string, priority: number } | null}
 */
function resolveByPattern(prompt, patterns) {
  if (!prompt || typeof prompt !== 'string' || !patterns || typeof patterns !== 'object') {
    return null;
  }
  const matches = [];
  for (const [agent, list] of Object.entries(patterns)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || !entry.pattern) continue;
      if (entry.pattern.test(prompt)) {
        matches.push({ agent, priority: Number(entry.priority) || 0 });
      }
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.priority - a.priority);
  return { agent: matches[0].agent, priority: matches[0].priority };
}

module.exports = { resolveByPattern };
