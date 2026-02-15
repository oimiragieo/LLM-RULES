#!/usr/bin/env node
'use strict';

const { parseCitations } = require('./parse-memory-citations.cjs');

function extractEvidenceIdsFromPrompt(text) {
  const input = String(text || '');
  const matches = input.match(/\[(?:mem|rag):[a-f0-9]{8}\]/g) || [];
  return [...new Set(matches)];
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (_err) {
    return null;
  }
}

function recordEvidenceIdsFromText(text, bucket) {
  for (const id of extractEvidenceIdsFromPrompt(text)) {
    bucket.add(id);
  }
}

function processAssistantBlocks(content, state) {
  for (const block of content) {
    if (block?.type === 'text' && typeof block?.text === 'string') {
      state.assistantTextBlocks.push(block.text);
    }
    if (block?.type === 'tool_use' && block?.name === 'Task') {
      recordEvidenceIdsFromText(String(block?.input?.prompt || ''), state.spawnedEvidenceIds);
    }
  }
}

function processParsedStreamObject(obj, state) {
  if (obj?.type === 'assistant' && obj?.message?.content && Array.isArray(obj.message.content)) {
    processAssistantBlocks(obj.message.content, state);
  }
  if (obj?.type === 'result' && typeof obj?.result === 'string') {
    state.finalResultText = obj.result;
  }
}

function parseStreamOutput(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const state = {
    spawnedEvidenceIds: new Set(),
    finalResultText: '',
    assistantTextBlocks: [],
  };

  for (const line of lines) {
    recordEvidenceIdsFromText(line, state.spawnedEvidenceIds);
    const obj = parseJsonLine(line);
    if (!obj) continue;
    processParsedStreamObject(obj, state);
  }

  const composedOutput = [state.finalResultText, ...state.assistantTextBlocks].join('\n');
  const outputCitations = parseCitations(composedOutput);
  const grounded =
    outputCitations.length > 0 && outputCitations.every(id => state.spawnedEvidenceIds.has(id));

  return {
    spawnedEvidenceIds: [...state.spawnedEvidenceIds],
    outputCitations,
    grounded,
    finalResultText: composedOutput,
  };
}

function hasNoStreamSignal(result) {
  if (!result || typeof result !== 'object') return true;
  const hasOutput = String(result.finalResultText || '').trim().length > 0;
  const hasEvidence =
    Array.isArray(result.spawnedEvidenceIds) && result.spawnedEvidenceIds.length > 0;
  return !hasOutput && !hasEvidence;
}

function computeSummary(results) {
  const total = results.length;
  const spawnSuccess = results.filter(r => r.ok).length;
  const withInjectedEvidence = results.filter(r => r.spawnedEvidenceIds.length > 0).length;
  const withOutputCitations = results.filter(r => r.outputCitations.length > 0).length;
  const groundedCount = results.filter(r => r.grounded).length;
  const withAnyOutput = results.filter(
    r => String(r.finalResultText || '').trim().length > 0
  ).length;
  const citationEligible = Math.max(withInjectedEvidence, 1);
  const citationObserved = Math.max(withOutputCitations, 1);

  return {
    total_cases: total,
    spawn_success_rate: spawnSuccess / Math.max(total, 1),
    evidence_injection_rate: withInjectedEvidence / Math.max(total, 1),
    citation_use_rate: withOutputCitations / citationEligible,
    groundedness_rate: groundedCount / citationObserved,
    timed_out_cases: results.filter(r => /timeout/i.test(String(r.error || ''))).length,
    output_observed_rate: withAnyOutput / Math.max(total, 1),
  };
}

module.exports = {
  extractEvidenceIdsFromPrompt,
  parseStreamOutput,
  hasNoStreamSignal,
  computeSummary,
};
