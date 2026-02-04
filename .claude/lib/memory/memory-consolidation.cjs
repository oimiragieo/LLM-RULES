'use strict';

const {
  CONSOLIDATION_SYSTEM_PROMPT,
  CONSOLIDATION_USER_PROMPT,
} = require('./prompts/consolidation.cjs');

function buildUserPrompt(newMemory, similarMemories) {
  const similar = Array.isArray(similarMemories) ? similarMemories : [];
  return CONSOLIDATION_USER_PROMPT.replace('{{newMemory}}', String(newMemory || ''))
    .replace(
      '{{similarMemories}}',
      similar.length > 0 ? similar.map(m => `- ${m}`).join('\n') : '(none)'
    )
    .trim();
}

async function consolidateNewMemory(newMemory, similarMemories, options = {}) {
  const ModelClient = require('../clients/model-client.cjs');
  const client = options.modelClient || new ModelClient();
  const userPrompt = buildUserPrompt(newMemory, similarMemories);
  const response = await client.generateText({
    system: CONSOLIDATION_SYSTEM_PROMPT,
    messages: userPrompt,
  });

  const raw = response?.text || response?.content || response;
  const cleaned = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    return {
      action: parsed.action || 'skip',
      reason: parsed.reason || '',
      merged_content: parsed.merged_content || null,
    };
  } catch (_e) {
    return { action: 'skip', reason: 'parse_failed', merged_content: null };
  }
}

module.exports = { buildUserPrompt, consolidateNewMemory };
