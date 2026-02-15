#!/usr/bin/env node
'use strict';

const { parseEvidenceFromPrompt } = require('../helpers/parse-memory-citations.cjs');

function selectEvidence(prompt, question) {
  const evidence = parseEvidenceFromPrompt(prompt);
  const questionText = String(question || '').toLowerCase();
  const keywords = questionText
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 4);

  let best = null;
  for (const [id, content] of evidence.entries()) {
    const hay = String(content || '').toLowerCase();
    const score = keywords.reduce((count, keyword) => count + (hay.includes(keyword) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { id, content, score };
    }
  }
  if (best) return { id: best.id, content: best.content };

  const first = evidence.entries().next();
  if (!first.done) {
    return { id: first.value[0], content: first.value[1] };
  }

  return null;
}

function runSubagentMemoryProbe({ prompt, question }) {
  const selected = selectEvidence(prompt, question);
  if (!selected) {
    return {
      answer: 'No usable memory evidence found.',
      citations: [],
    };
  }

  return {
    answer: `Based on memory evidence ${selected.id}: ${selected.content}`,
    citations: [selected.id],
  };
}

module.exports = {
  runSubagentMemoryProbe,
};
