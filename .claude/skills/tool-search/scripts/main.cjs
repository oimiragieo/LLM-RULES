#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findProjectRoot(start = __dirname) {
  let dir = start;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseArgs(argv) {
  const options = {};
  const text = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      text.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return { options, query: text.join(' ').trim() };
}

function loadManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, '.claude', 'config', 'tool-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`tool-manifest missing at ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function asSearchDocs(manifest) {
  const docs = [];
  for (const tool of manifest?.tools?.core || []) {
    docs.push({
      name: tool.name,
      category: 'core',
      description: tool.description || '',
      tags: [tool.server, tool.scope].filter(Boolean).join(' '),
    });
  }
  for (const tool of manifest?.tools?.mcp || []) {
    docs.push({
      name: tool.name,
      category: `mcp:${tool.server || 'unknown'}`,
      description: tool.description || '',
      tags: [tool.server, tool.connector, tool.scope].filter(Boolean).join(' '),
    });
  }
  return docs;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_:-]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function scoreDoc(doc, queryTokens) {
  if (queryTokens.length === 0) return 0;
  const haystack = `${doc.name} ${doc.description} ${doc.tags}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (doc.name.toLowerCase() === token) score += 6;
    else if (doc.name.toLowerCase().includes(token)) score += 4;
    else if (haystack.includes(token)) score += 1;
  }
  return score;
}

function searchTools(query, docs, limit = 8) {
  const queryTokens = tokenize(query);
  return docs
    .map(doc => ({ ...doc, score: scoreDoc(doc, queryTokens) }))
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function main(input = {}) {
  const query = String(input.query || '').trim();
  const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Number(input.limit)) : 8;
  const projectRoot = input.projectRoot || findProjectRoot();

  if (!query) {
    return { ok: false, error: 'query is required' };
  }

  const manifest = loadManifest(projectRoot);
  const docs = asSearchDocs(manifest);
  const results = searchTools(query, docs, limit);
  return {
    ok: true,
    query,
    totalTools: docs.length,
    returned: results.length,
    results,
  };
}

if (require.main === module) {
  const { options, query } = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
tool-search

Usage:
  node main.cjs <query> [--limit 8]
`);
    process.exit(0);
  }
  const result = main({
    query: options.query || query,
    limit: options.limit,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  parseArgs,
  loadManifest,
  asSearchDocs,
  searchTools,
  main,
};
