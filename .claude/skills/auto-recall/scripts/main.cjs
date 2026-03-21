#!/usr/bin/env node
/**
 * Auto-Recall Skill - Main Script
 *
 * Semantic retrieval from perpetual memory with recency boosting
 * and category filtering.
 *
 * Usage:
 *   node .claude/skills/auto-recall/scripts/main.cjs --query "search term"
 *   node .claude/skills/auto-recall/scripts/main.cjs --query "auth decision" --category decision
 *   node .claude/skills/auto-recall/scripts/main.cjs --query "recent" --recency-boost --json
 */

'use strict';

const { queryMemory } = require('../../../tools/cli/auto-embed.cjs');

/**
 * Apply recency boost to results
 * final_score = similarity * 0.7 + recency * 0.3
 * recency = max(0, 1 - days_since / 30)
 */
function applyRecencyBoost(results) {
  const now = Date.now();
  return results
    .map(r => {
      const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      const daysSince = (now - ts) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - daysSince / 30);
      const similarity = parseFloat(r.similarity) || 0;
      const boostedScore = similarity * 0.7 + recencyScore * 0.3;
      return { ...r, boostedScore: boostedScore.toFixed(3), recencyScore: recencyScore.toFixed(3) };
    })
    .sort((a, b) => parseFloat(b.boostedScore) - parseFloat(a.boostedScore));
}

/**
 * Format results for prompt injection
 */
function formatForInjection(results) {
  if (results.length === 0) return 'No relevant perpetual memory entries found.';

  const lines = ['## Recalled Context (from perpetual memory)\n'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sim = r.boostedScore || r.similarity || 'N/A';
    const daysAgo = r.timestamp
      ? Math.floor((Date.now() - new Date(r.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : '?';
    lines.push(`${i + 1}. [${r.category}] (score=${sim}, ${daysAgo}d ago, agent=${r.agent})`);
    lines.push(`   ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}\n`);
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let query = null;
  let category = null;
  let limit = 10;
  let recencyBoost = false;
  let json = false;
  let minSimilarity = 0.3;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--query':
        query = args[++i];
        break;
      case '--category':
        category = args[++i];
        break;
      case '--limit':
        limit = parseInt(args[++i], 10) || 10;
        break;
      case '--recency-boost':
        recencyBoost = true;
        break;
      case '--json':
        json = true;
        break;
      case '--min-similarity':
        minSimilarity = parseFloat(args[++i]) || 0.3;
        break;
      case '--help':
      case '-h':
        console.log('Auto-Recall: Semantic retrieval from perpetual memory');
        console.log(
          'Usage: node main.cjs --query "search term" [--category decision] [--limit 10] [--recency-boost] [--json]'
        );
        return 0;
      default:
        if (!query && !args[i].startsWith('--')) query = args[i];
        break;
    }
  }

  if (!query) {
    console.error('Error: --query required');
    console.error('Usage: node main.cjs --query "search term"');
    return 1;
  }

  try {
    // Fetch more than requested to allow filtering
    let results = await queryMemory(query, Math.min(limit * 2, 50));

    // Filter by category if specified
    if (category) {
      results = results.filter(r => r.category === category);
    }

    // Filter by minimum similarity
    results = results.filter(r => {
      const sim = parseFloat(r.similarity);
      return !isNaN(sim) && sim >= minSimilarity;
    });

    // Apply recency boost if requested
    if (recencyBoost) {
      results = applyRecencyBoost(results);
    }

    // Limit results
    results = results.slice(0, limit);

    if (json) {
      console.log(JSON.stringify({ query, count: results.length, results }, null, 2));
    } else {
      console.log(formatForInjection(results));
    }

    return 0;
  } catch (err) {
    // Graceful degradation: never block on recall failure
    console.error(`Auto-recall unavailable: ${err.message}`);
    if (json) {
      console.log(JSON.stringify({ query, count: 0, results: [], error: err.message }));
    }
    return 0; // Return 0 even on error (non-blocking)
  }
}

if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch(err => {
      console.error('Auto-recall error:', err.message);
      process.exit(0); // Never block on failure
    });
}

module.exports = { main, applyRecencyBoost, formatForInjection };
