#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const assembler = require('../../.claude/lib/spawn/prompt-assembler.cjs');
const { runSubagentMemoryProbe } = require('../fixtures/subagent-memory-probe.cjs');
const {
  parseCitations,
  parseEvidenceFromPrompt,
} = require('../helpers/parse-memory-citations.cjs');

const BASE_PROMPT = `You are DEVELOPER.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio
`;

function buildPromptWithMemory({ memory, rag }) {
  const memorySection = assembler.formatMemorySection(memory || {});
  const ragSection = assembler.formatRagMemorySection(rag || []);
  const combinedMemory = ragSection ? `${memorySection}\n\n${ragSection}` : memorySection;
  return assembler.injectSections(BASE_PROMPT, {
    toolsSection: '',
    skillsSection: '',
    discoverySection: '',
    memorySection: combinedMemory,
    behaviourSection: '',
  });
}

describe('subagent memory/rag usage', () => {
  it('uses task-relevant RAG evidence when available and cites injected id', () => {
    const prompt = buildPromptWithMemory({
      memory: {
        gotchas: ['Legacy fallback memory only'],
      },
      rag: [
        {
          content: 'Use auth migration path RAG_SENTINEL_AUTH_9000 for OAuth cutover',
          similarity: 0.92,
        },
      ],
    });

    const output = runSubagentMemoryProbe({
      prompt,
      question: 'What should we use for auth migration and OAuth cutover?',
    });

    const promptEvidence = parseEvidenceFromPrompt(prompt);
    const outputCitations = parseCitations(output.answer);
    const cited = output.citations[0];

    assert.ok(cited.startsWith('[rag:'), 'Expected RAG citation for auth-specific question');
    assert.ok(outputCitations.includes(cited), 'Answer should include cited evidence ID');
    assert.ok(promptEvidence.has(cited), 'Citation must map to injected prompt evidence');
    assert.match(promptEvidence.get(cited), /RAG_SENTINEL_AUTH_9000/);
  });

  it('falls back to memory evidence and never cites rag when RAG section is absent', () => {
    const prompt = buildPromptWithMemory({
      memory: {
        patterns: ['Prefer deterministic retries MEM_SENTINEL_RETRY_42'],
      },
      rag: [],
    });

    const output = runSubagentMemoryProbe({
      prompt,
      question: 'What retry behavior should be used?',
    });

    assert.equal(output.citations.length, 1);
    assert.ok(output.citations[0].startsWith('[mem:'), 'Expected memory citation');
    assert.ok(!output.answer.includes('[rag:'), 'Answer should not cite RAG when missing');
  });

  it('prefers fresh memory over stale memory when question targets the fresh fact', () => {
    const prompt = buildPromptWithMemory({
      memory: {
        gotchas: [
          'STALE: Use legacy branch flow OLD_SENTINEL_001',
          'FRESH: Use protected branch flow NEW_SENTINEL_002',
        ],
      },
      rag: [],
    });

    const output = runSubagentMemoryProbe({
      prompt,
      question: 'Which protected branch flow should we use now?',
    });

    const evidence = parseEvidenceFromPrompt(prompt);
    const cited = output.citations[0];
    assert.ok(evidence.has(cited), 'citation must resolve to injected evidence');
    assert.match(evidence.get(cited), /NEW_SENTINEL_002/);
    assert.doesNotMatch(evidence.get(cited), /OLD_SENTINEL_001/);
  });

  it('assembleSpawnPromptAsync omits rag citations when RAG_AT_SPAWN is off', async () => {
    const original = process.env.RAG_AT_SPAWN;
    process.env.RAG_AT_SPAWN = 'off';
    try {
      const prompt = await assembler.assembleSpawnPromptAsync({
        agentType: 'developer',
        allowedTools: ['Read', 'TaskUpdate'],
        basePrompt: BASE_PROMPT,
        memoryQuery: 'ignored query',
        searchMemoryFn: async () => [{ content: 'RAG_DISABLED_SENTINEL', similarity: 0.99 }],
      });

      assert.ok(!prompt.includes('[rag:'), 'No RAG evidence ids expected when kill switch is off');
    } finally {
      if (typeof original === 'undefined') {
        delete process.env.RAG_AT_SPAWN;
      } else {
        process.env.RAG_AT_SPAWN = original;
      }
    }
  });
});
