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
 * Incrementally compacts a message array by removing the oldest non-protected messages
 * until the total token count falls at or below the threshold.
 *
 * The last `protectedCount` messages are never removed.
 *
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   threshold: number,
 *   protectedCount?: number
 * }} opts
 * @returns {{
 *   compacted: Array<{ role: string, content: string }>,
 *   removedCount: number,
 *   savedTokens: number
 * }}
 */
function compactMessages({ messages, threshold, protectedCount = 5 }) {
  if (!messages || messages.length === 0) {
    return { compacted: [], removedCount: 0, savedTokens: 0 };
  }

  // Calculate total tokens
  let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  if (totalTokens <= threshold) {
    return { compacted: messages.slice(), removedCount: 0, savedTokens: 0 };
  }

  // Number of messages that can be removed (non-protected prefix)
  const removableCount = Math.max(0, messages.length - protectedCount);

  // Remove oldest messages one by one until under threshold
  let removeUpTo = 0; // exclusive index into messages to drop
  let savedTokens = 0;

  for (let i = 0; i < removableCount && totalTokens > threshold; i++) {
    const cost = estimateTokens(messages[i].content);
    totalTokens -= cost;
    savedTokens += cost;
    removeUpTo = i + 1;
  }

  return {
    compacted: messages.slice(removeUpTo),
    removedCount: removeUpTo,
    savedTokens,
  };
}

module.exports = { compactMessages, estimateTokens };
