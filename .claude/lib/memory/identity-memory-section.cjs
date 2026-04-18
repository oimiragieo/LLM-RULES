'use strict';

const { memoryGrep } = require('./memory-tools.cjs');

const AGENT_MEMORY_FILTERS = Object.freeze({
  developer: Object.freeze(['bug', 'implementation', 'refactor', 'fix']),
  qa: Object.freeze(['test', 'regression', 'coverage', 'qa']),
  architect: Object.freeze(['architecture', 'design', 'system', 'diagram']),
  'security-architect': Object.freeze(['security', 'threat', 'audit', 'auth']),
});

function getSupportedAgentTypes() {
  return Object.keys(AGENT_MEMORY_FILTERS);
}

function generateMemorySection(agentType, { maxChars = 400 } = {}) {
  const keywords = AGENT_MEMORY_FILTERS[agentType];
  if (!keywords) {
    return '';
  }

  const lines = [];
  for (const keyword of keywords) {
    const matches = memoryGrep(keyword, { maxResults: 2 });
    for (const match of matches) {
      lines.push(`- ${match.file}:${match.line} ${match.text}`.trim());
      if (lines.length >= 4) {
        break;
      }
    }
    if (lines.length >= 4) {
      break;
    }
  }

  const header = `## Memory Notes (${agentType})\n`;
  const body = lines.length > 0 ? lines.join('\n') : '- No matching memory entries.';
  return `${header}${body}`.slice(0, Math.max(0, maxChars) + header.length);
}

module.exports = {
  AGENT_MEMORY_FILTERS,
  generateMemorySection,
  getSupportedAgentTypes,
};
