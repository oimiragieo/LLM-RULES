#!/usr/bin/env node
'use strict';

/**
 * Identity Memory Section Generator (Feature G3)
 * ================================================
 * Generates "You remember:" clauses for agent identity prompts
 * by reading relevant memory entries filtered by agent type.
 *
 * Usage:
 *   const { generateMemorySection } = require('./identity-memory-section.cjs');
 *
 *   const section = generateMemorySection('developer', { maxEntries: 5, maxChars: 500 });
 *   // => "## You remember:\n- ADR-075: config.yaml is source of truth for model selection\n- ..."
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', '..', 'context', 'memory');

/**
 * Agent type → relevant memory keywords mapping.
 */
const AGENT_MEMORY_FILTERS = {
  developer: ['implementation', 'pattern', 'gotcha', 'bug', 'fix', 'convention', 'tdd'],
  qa: ['test', 'coverage', 'regression', 'flaky', 'assertion', 'validation'],
  architect: ['architecture', 'adr', 'decision', 'pattern', 'scalability', 'design'],
  'security-architect': [
    'security',
    'vulnerability',
    'cve',
    'owasp',
    'authentication',
    'injection',
  ],
  'code-reviewer': ['review', 'pattern', 'anti-pattern', 'convention', 'standard'],
  planner: ['plan', 'dependency', 'risk', 'estimation', 'scope', 'requirement'],
  devops: ['deploy', 'ci', 'docker', 'kubernetes', 'pipeline', 'infrastructure'],
  'technical-writer': ['documentation', 'changelog', 'readme', 'api-doc', 'template'],
};

/**
 * Generate a "You remember:" section for an agent.
 * @param {string} agentType
 * @param {Object} [options]
 * @param {number} [options.maxEntries=5] - Maximum memory entries
 * @param {number} [options.maxChars=600] - Maximum total characters
 * @returns {string} Markdown section or empty string
 */
function generateMemorySection(agentType, options = {}) {
  const maxEntries = options.maxEntries ?? 5;
  const maxChars = options.maxChars ?? 600;

  const entries = collectRelevantEntries(agentType, maxEntries);
  if (entries.length === 0) return '';

  const lines = ['## You remember:', ''];
  let totalChars = 0;

  for (const entry of entries) {
    const line = `- ${entry.text}`;
    if (totalChars + line.length > maxChars) break;
    lines.push(line);
    totalChars += line.length;
  }

  return lines.join('\n');
}

/**
 * Collect memory entries relevant to an agent type.
 * @param {string} agentType
 * @param {number} maxEntries
 * @returns {Array<{text: string, source: string, score: number}>}
 */
function collectRelevantEntries(agentType, maxEntries) {
  const filters = AGENT_MEMORY_FILTERS[agentType] || [];
  const entries = [];

  // Read decisions.md and issues.md for relevant entries
  const files = ['decisions.md', 'issues.md'];

  for (const file of files) {
    const filePath = path.join(MEMORY_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Score relevance based on keyword matches
        const lower = trimmed.toLowerCase();
        let score = 0;
        for (const keyword of filters) {
          if (lower.includes(keyword)) score += 1;
        }

        if (score > 0) {
          entries.push({
            text: trimmed.substring(0, 150).replace(/^-\s*/, ''),
            source: file,
            score,
          });
        }
      }
    } catch {
      // Skip
    }
  }

  // Sort by relevance score, take top N
  return entries.sort((a, b) => b.score - a.score).slice(0, maxEntries);
}

/**
 * Get the list of agent types that have memory filters defined.
 * @returns {string[]}
 */
function getSupportedAgentTypes() {
  return Object.keys(AGENT_MEMORY_FILTERS);
}

module.exports = {
  generateMemorySection,
  collectRelevantEntries,
  getSupportedAgentTypes,
  AGENT_MEMORY_FILTERS,
};
