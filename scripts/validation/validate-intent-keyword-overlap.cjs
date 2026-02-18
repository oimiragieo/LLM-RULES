#!/usr/bin/env node
'use strict';

const {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
} = require('../../.claude/lib/routing/routing-table-intent-keywords.cjs');

function normalizeKeyword(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeAgents(agents) {
  return [...new Set((agents || []).map(String))].sort();
}

function main() {
  const keywordToAgents = new Map();

  for (const [agentId, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords || []) {
      const normalizedKeyword = normalizeKeyword(keyword);
      if (!normalizedKeyword) continue;
      if (!keywordToAgents.has(normalizedKeyword)) {
        keywordToAgents.set(normalizedKeyword, new Set());
      }
      keywordToAgents.get(normalizedKeyword).add(agentId);
    }
  }

  const duplicates = [];
  for (const [keyword, agentsSet] of keywordToAgents.entries()) {
    const agents = normalizeAgents([...agentsSet]);
    if (agents.length > 1) {
      duplicates.push({ keyword, agents });
    }
  }
  duplicates.sort((a, b) => a.keyword.localeCompare(b.keyword));

  const allowed = new Map(
    Object.entries(ALLOWED_INTENT_KEYWORD_OVERLAPS || {}).map(([keyword, agents]) => [
      normalizeKeyword(keyword),
      normalizeAgents(agents),
    ])
  );

  const errors = [];

  for (const duplicate of duplicates) {
    const allowedAgents = allowed.get(duplicate.keyword);
    const duplicateKey = duplicate.agents.join('|');
    const allowedKey = (allowedAgents || []).join('|');
    if (!allowedAgents || duplicateKey !== allowedKey) {
      errors.push(
        `Unexpected overlap: "${duplicate.keyword}" => [${duplicate.agents.join(', ')}]`
      );
    }
  }

  for (const [keyword, allowedAgents] of allowed.entries()) {
    const currentSet = keywordToAgents.get(keyword);
    const currentAgents = normalizeAgents(currentSet ? [...currentSet] : []);
    const currentKey = currentAgents.join('|');
    const allowedKey = allowedAgents.join('|');
    if (currentAgents.length < 2 || currentKey !== allowedKey) {
      errors.push(
        `Stale allowlist entry: "${keyword}" expected [${allowedAgents.join(', ')}], got [${currentAgents.join(', ')}]`
      );
    }
  }

  if (errors.length > 0) {
    console.error('[validate-intent-keyword-overlap] FAILED');
    for (const error of errors) {
      console.error(` - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

}

main();
