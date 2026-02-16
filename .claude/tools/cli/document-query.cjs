#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const fetch = global.fetch;

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function printUsage() {
  process.stdout.write(
    ['Usage:', '  document-query.cjs --document <path_or_url> [--query "question"]'].join('\n') +
      '\n'
  );
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function loadDocument(doc) {
  if (isUrl(doc)) {
    if (typeof fetch !== 'function') {
      throw new Error('fetch is not available in this runtime');
    }
    const res = await fetch(doc);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${doc}: ${res.status}`);
    }
    return await res.text();
  }
  const resolved = path.isAbsolute(doc) ? doc : path.join(PROJECT_ROOT, doc);
  return fs.readFileSync(resolved, 'utf8');
}

function scoreParagraphs(text, query) {
  const q = String(query || '')
    .toLowerCase()
    .trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const paragraphs = text.split(/\n{2,}/);
  const scored = paragraphs.map(p => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!term) continue;
      const matches = lower.split(term).length - 1;
      if (matches > 0) score += matches;
    }
    return { paragraph: p.trim(), score };
  });
  return scored.filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const documentPath = args.document || args._[0];
  if (!documentPath || args.help) {
    printUsage();
    return { ok: Boolean(documentPath) };
  }
  const query = args.query || args._[1] || '';

  const text = await loadDocument(documentPath);
  if (!query) {
    process.stdout.write(text + '\n');
    return { ok: true };
  }

  const scored = scoreParagraphs(text, query);
  if (scored.length === 0) {
    process.stdout.write('No matching sections found.\n');
    return { ok: true };
  }

  const top = scored.slice(0, 3);
  process.stdout.write(
    top.map(item => `---\nScore: ${item.score}\n${item.paragraph}\n`).join('\n') + '\n'
  );
  return { ok: true };
}

const wrappedRun = wrapCLITool(run, 'document-query');

if (require.main === module) {
  wrappedRun();
}

module.exports = {
  run,
  parseArgs,
  scoreParagraphs,
};
