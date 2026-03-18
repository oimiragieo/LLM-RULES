'use strict';

/**
 * Estimates the number of tokens in a string using the 1 token ≈ 4 chars heuristic.
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Assembles a context window from a list of messages, respecting a token budget.
 *
 * The last `protectedTailCount` messages are always kept verbatim in `tail`.
 * Remaining (prefix) messages are included only while they fit within
 * `budgetTokens - tailTokens`. When the prefix overflows the budget, earlier
 * messages are dropped and `truncated` is set to true.
 *
 * @param {{
 *   messages: Array<{ role: string, content: string, timestamp: number }>,
 *   budgetTokens: number,
 *   protectedTailCount: number
 * }} opts
 * @returns {{
 *   prefix: Array<{ role: string, content: string, timestamp: number, summarized?: true }>,
 *   tail: Array<{ role: string, content: string, timestamp: number }>,
 *   totalTokens: number,
 *   truncated: boolean
 * }}
 */
function assembleContext({ messages, budgetTokens, protectedTailCount }) {
  if (!messages || messages.length === 0) {
    return { prefix: [], tail: [], totalTokens: 0, truncated: false };
  }

  // Split messages into prefix candidates and protected tail
  const tailStart = Math.max(0, messages.length - protectedTailCount);
  const tailMessages = messages.slice(tailStart);
  const prefixCandidates = messages.slice(0, tailStart);

  // Calculate token cost of tail
  const tailTokens = tailMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Budget remaining for prefix
  const prefixBudget = budgetTokens - tailTokens;

  // Greedily include prefix messages from newest to oldest, respecting budget
  // We want to include as many recent prefix messages as possible
  let includedPrefixTokens = 0;
  const includedPrefix = [];

  // Iterate from newest prefix message backwards
  for (let i = prefixCandidates.length - 1; i >= 0; i--) {
    const msg = prefixCandidates[i];
    const cost = estimateTokens(msg.content);
    if (includedPrefixTokens + cost <= prefixBudget) {
      includedPrefixTokens += cost;
      includedPrefix.unshift(msg);
    } else {
      break;
    }
  }

  const truncated = includedPrefix.length < prefixCandidates.length;

  // Mark prefix messages with summarized flag when truncation occurred
  const prefix = truncated
    ? includedPrefix.map(m => Object.assign({}, m, { summarized: true }))
    : includedPrefix;

  const totalTokens = includedPrefixTokens + tailTokens;

  return { prefix, tail: tailMessages, totalTokens, truncated };
}

module.exports = { assembleContext, estimateTokens };
