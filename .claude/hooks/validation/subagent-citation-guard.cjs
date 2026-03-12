#!/usr/bin/env node
'use strict';

const {
  parseHookInputAsync,
  getToolName,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');

const CITATION_RE = /\[(mem|rag):([a-f0-9]{8})\]/gi;

function extractCitationIds(text) {
  const ids = new Set();
  const input = String(text || '');
  let match;
  while ((match = CITATION_RE.exec(input)) !== null) {
    ids.add(`${match[1]}:${match[2]}`);
  }
  return ids;
}

function resolveMode(mode) {
  const normalized = String(mode || process.env.SUBAGENT_CITATION_VALIDATION || 'warn')
    .trim()
    .toLowerCase();
  if (normalized === 'off') return 'off';
  if (normalized === 'block') return 'block';
  return 'warn';
}

function validateCitations({ prompt, output, mode } = {}) {
  const effectiveMode = resolveMode(mode);
  if (effectiveMode === 'off') {
    return { pass: true, result: 'allow', message: '' };
  }

  const injected = extractCitationIds(prompt);
  const cited = extractCitationIds(output);
  if (injected.size === 0) {
    return { pass: true, result: 'allow', message: '' };
  }

  const fabricated = [];
  for (const id of cited) {
    if (!injected.has(id)) fabricated.push(id);
  }

  const missingAllRequiredCitation = cited.size === 0;
  if (!missingAllRequiredCitation && fabricated.length === 0) {
    return { pass: true, result: 'allow', message: '' };
  }

  const issues = [];
  if (missingAllRequiredCitation) {
    issues.push('missing citation to injected [mem:...] / [rag:...] evidence');
  }
  if (fabricated.length > 0) {
    issues.push(`fabricated citation ids: ${fabricated.join(', ')}`);
  }
  const message = `[SUBAGENT-CITATION] ${issues.join('; ')}`;

  if (effectiveMode === 'block') {
    return { pass: false, result: 'block', message, fabricated };
  }
  return { pass: true, result: 'warn', message, fabricated };
}

async function main() {
  const hookInput = await parseHookInputAsync();
  if (!hookInput) {
    process.exit(0);
  }

  const toolName = getToolName(hookInput);
  if (toolName !== 'TaskUpdate' && toolName !== 'TaskOutput') {
    process.exit(0);
  }

  const toolInput = hookInput.tool_input || hookInput.input || {};
  const prompt = toolInput.prompt || hookInput.prompt || '';
  const outputText =
    hookInput.tool_output ||
    hookInput.output ||
    hookInput.result ||
    toolInput.summary ||
    toolInput.description ||
    '';
  const check = validateCitations({ prompt, output: outputText });

  if (check.result === 'warn' && check.message) {
    console.error(check.message);
  }
  if (check.result === 'block') {
    console.log(formatResult('block', check.message));
    process.exit(2);
  }

  process.exit(0);
}

module.exports = {
  extractCitationIds,
  validateCitations,
  resolveMode,
};

if (require.main === module) {
  main().catch(error => {
    console.error('[subagent-citation-guard] hook failed:', error?.message || String(error));
    process.exit(0);
  });
}
