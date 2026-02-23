'use strict';

/**
 * Token budget estimator (Track 1.1)
 */

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  // Fallback simple tokenizer: chars / 4
  return Math.ceil(text.length / 4);
}

function getContextPressure(opts = {}) {
  const {
    systemPrompt = '',
    history = '',
    incomingTaskPrompt = '',
    contextWindow = parseInt(process.env.CONTEXT_WINDOW_TOKENS) || 200000,
  } = opts;

  let totalText = '';
  if (typeof systemPrompt === 'string') totalText += systemPrompt;
  if (typeof history === 'string') totalText += history;
  if (typeof incomingTaskPrompt === 'string') totalText += incomingTaskPrompt;

  const tokens = estimateTokens(totalText);

  if (contextWindow <= 0) return 0;

  const ratio = Math.min(Math.max(tokens / contextWindow, 0), 1);
  return ratio;
}

module.exports = {
  estimateTokens,
  getContextPressure,
};
