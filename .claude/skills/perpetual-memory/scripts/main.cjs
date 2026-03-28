#!/usr/bin/env node
/**
 * Perpetual Memory Skill - Main Script
 *
 * Orchestrates the perpetual memory workflow:
 * 1. Accepts interaction text (via args or stdin)
 * 2. Delegates to auto-embed.cjs for embedding + storage
 * 3. Reports results
 *
 * Usage:
 *   node .claude/skills/perpetual-memory/scripts/main.cjs --text "interaction"
 *   node .claude/skills/perpetual-memory/scripts/main.cjs --query "search term"
 *   node .claude/skills/perpetual-memory/scripts/main.cjs --stats
 */

'use strict';

const { embedAndStore, queryMemory, getStats } = require('../../../tools/cli/auto-embed.cjs');

async function handleQueryMode(query, limit) {
  if (!query) {
    console.error('Error: --query requires a search string');
    return 1;
  }

  const results = await queryMemory(query, limit);
  if (results.length === 0) {
    console.log(`No perpetual memory results for: "${query}"`);
    return 0;
  }

  console.log(`Perpetual Memory: ${results.length} results for "${query}"\n`);
  for (const r of results) {
    console.log(`[${r.category}] sim=${r.similarity} agent=${r.agent} ${r.timestamp}`);
    console.log(`  ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}\n`);
  }

  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'store';
  let text = null;
  let query = null;
  let agent = 'unknown';
  let taskId = null;
  let category = null;
  let limit = 10;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--text':
        text = args[++i];
        break;
      case '--query':
        mode = 'query';
        query = args[++i];
        break;
      case '--stats':
        mode = 'stats';
        break;
      case '--agent':
        agent = args[++i];
        break;
      case '--task-id':
        taskId = args[++i];
        break;
      case '--category':
        category = args[++i];
        break;
      case '--limit':
        limit = parseInt(args[++i], 10) || 10;
        break;
      case '--help':
      case '-h':
        console.log('Perpetual Memory Skill');
        console.log('Usage: node main.cjs --text "..." | --query "..." | --stats');
        return 0;
      default:
        if (!text && !args[i].startsWith('--')) text = args[i];
        break;
    }
  }

  if (mode === 'stats') {
    const stats = await getStats();
    console.log(JSON.stringify(stats, null, 2));
    return 0;
  }

  if (mode === 'query') {
    return handleQueryMode(query, limit);
  }

  // Store mode
  if (!text) {
    console.error('Error: --text required for store mode');
    return 1;
  }

  const result = await embedAndStore(text, { agent, taskId, category, dedupThreshold: 0.92 });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch(err => {
      console.error('Perpetual memory error:', err.message);
      process.exit(1);
    });
}

module.exports = { main };
