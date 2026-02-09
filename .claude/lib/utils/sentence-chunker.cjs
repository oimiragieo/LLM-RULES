'use strict';

function splitSentencesWithOffsets(text) {
  const input = String(text || '');
  const trimmed = input.trim();
  if (!trimmed) return [];
  const matches = input.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g);
  const sentences = [];
  for (const match of matches) {
    if (!match[0]) continue;
    const content = match[0].trim();
    if (!content) continue;
    const startIndex = match.index ?? 0;
    sentences.push({ content, startIndex, endIndex: startIndex + match[0].length });
  }
  return sentences;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

/**
 * Chunk text by sentence boundaries.
 * @param {string} text
 * @param {{ maxCharBuffer?: number, maxTokens?: number, includeTokenCount?: boolean }} options
 * @returns {Array<{ content: string, startIndex: number, endIndex: number, tokenCount?: number }>} chunks
 */
function chunkBySentences(text, options = {}) {
  const maxCharBuffer = options.maxCharBuffer ?? 1000;
  const maxTokens = options.maxTokens ?? null;
  const includeTokenCount = Boolean(options.includeTokenCount);
  const sentences = splitSentencesWithOffsets(text);
  if (sentences.length === 0) return [];

  const chunks = [];
  let current = [];
  let currentLen = 0;
  let currentStart = null;
  let currentEnd = null;

  for (const sentence of sentences) {
    const sentenceLen = sentence.content.length + (current.length ? 1 : 0);
    const nextLen = currentLen + sentenceLen;
    const currentContent = current.length ? current.join(' ') : '';
    const nextContent = currentContent ? `${currentContent} ${sentence.content}` : sentence.content;
    const nextTokenCount = maxTokens ? estimateTokens(nextContent) : null;

    const exceedsChar = nextLen > maxCharBuffer && current.length > 0;
    const exceedsToken = maxTokens && nextTokenCount > maxTokens && current.length > 0;

    if (exceedsChar || exceedsToken) {
      const content = current.join(' ');
      const chunk = {
        content,
        startIndex: currentStart ?? 0,
        endIndex: currentEnd ?? (currentStart ?? 0) + content.length,
      };
      if (includeTokenCount) chunk.tokenCount = estimateTokens(content);
      chunks.push(chunk);
      current = [sentence.content];
      currentLen = sentence.content.length;
      currentStart = sentence.startIndex;
      currentEnd = sentence.endIndex;
      continue;
    }

    if (current.length === 0) {
      currentStart = sentence.startIndex;
    }
    current.push(sentence.content);
    currentLen = nextLen;
    currentEnd = sentence.endIndex;
  }

  if (current.length > 0) {
    const content = current.join(' ');
    const chunk = {
      content,
      startIndex: currentStart ?? 0,
      endIndex: currentEnd ?? (currentStart ?? 0) + content.length,
    };
    if (includeTokenCount) chunk.tokenCount = estimateTokens(content);
    chunks.push(chunk);
  }

  return chunks;
}

module.exports = {
  chunkBySentences,
  estimateTokens,
  splitSentencesWithOffsets,
};
