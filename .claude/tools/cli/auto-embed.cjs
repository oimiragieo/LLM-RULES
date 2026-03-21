#!/usr/bin/env node
/**
 * Auto-Embed CLI Tool
 *
 * Takes interaction text as input, generates embeddings using the existing
 * LanceDB/embedding pipeline, stores with metadata (timestamp, agent, task_id,
 * category), auto-categorizes content, and handles deduplication via similarity
 * threshold.
 *
 * Part of the Perpetual Memory Architecture.
 *
 * Usage:
 *   node .claude/tools/cli/auto-embed.cjs --text "interaction text"
 *   node .claude/tools/cli/auto-embed.cjs --text "text" --agent developer --task-id task-5
 *   echo "text" | node .claude/tools/cli/auto-embed.cjs --stdin
 *   node .claude/tools/cli/auto-embed.cjs --query "search query" --limit 5
 *   node .claude/tools/cli/auto-embed.cjs --stats
 *
 * Options:
 *   --text <string>      Text to embed and store
 *   --stdin              Read text from stdin
 *   --agent <string>     Agent that produced the interaction (default: unknown)
 *   --task-id <string>   Task ID associated with the interaction
 *   --category <string>  Override auto-categorization (decision|learning|pattern|gotcha|issue)
 *   --query <string>     Search perpetual memory by semantic similarity
 *   --limit <number>     Max results for query (default: 10)
 *   --dedup-threshold <number>  Similarity threshold for deduplication (default: 0.92)
 *   --stats              Show perpetual memory statistics
 *   --help               Show this help message
 */

'use strict';

const path = require('path');
const fs = require('fs');
// Constants
const TABLE_NAME = 'perpetual_memory';
const LANCEDB_DIR = path.resolve('.claude/context/data/lancedb');
const DEFAULT_DEDUP_THRESHOLD = 0.92;
const CATEGORY_KEYWORDS = {
  decision: [
    'decided',
    'decision',
    'chose',
    'selected',
    'tradeoff',
    'trade-off',
    'rationale',
    'opted',
    'prefer',
    'adr',
    'architecture decision',
  ],
  learning: [
    'learned',
    'learning',
    'discovered',
    'found that',
    'realized',
    'insight',
    'takeaway',
    'pattern found',
    'works because',
  ],
  pattern: [
    'pattern',
    'approach',
    'technique',
    'method',
    'strategy',
    'best practice',
    'convention',
    'idiom',
    'recipe',
  ],
  gotcha: [
    'gotcha',
    'pitfall',
    'anti-pattern',
    'risk',
    'warning',
    'careful',
    'watch out',
    'caveat',
    'trap',
    'footgun',
    'sharp edge',
  ],
  issue: [
    'issue',
    'bug',
    'error',
    'broken',
    'failing',
    'incident',
    'defect',
    'regression',
    'blocker',
    'gap',
  ],
};

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    text: null,
    stdin: false,
    agent: 'unknown',
    taskId: null,
    category: null,
    query: null,
    limit: 10,
    dedupThreshold: DEFAULT_DEDUP_THRESHOLD,
    stats: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--text':
        parsed.text = args[++i];
        break;
      case '--stdin':
        parsed.stdin = true;
        break;
      case '--agent':
        parsed.agent = args[++i];
        break;
      case '--task-id':
        parsed.taskId = args[++i];
        break;
      case '--category':
        parsed.category = args[++i];
        break;
      case '--query':
        parsed.query = args[++i];
        break;
      case '--limit':
        parsed.limit = parseInt(args[++i], 10) || 10;
        break;
      case '--dedup-threshold':
        parsed.dedupThreshold = parseFloat(args[++i]) || DEFAULT_DEDUP_THRESHOLD;
        break;
      case '--stats':
        parsed.stats = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        // Treat bare argument as text if --text not specified
        if (!parsed.text && !args[i].startsWith('--')) {
          parsed.text = args[i];
        }
        break;
    }
  }

  return parsed;
}

/**
 * Auto-categorize text based on keyword matching
 * @param {string} text - Text to categorize
 * @returns {string} Category: decision|learning|pattern|gotcha|issue
 */
function autoCategorizee(text) {
  const lower = text.toLowerCase();
  const scores = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[category]++;
      }
    }
  }

  // Find category with highest score
  let bestCategory = 'learning'; // default
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Read text from stdin
 * @returns {Promise<string>}
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
    // Timeout after 5s if no input
    setTimeout(() => {
      if (!data) reject(new Error('No stdin input received within 5 seconds'));
    }, 5000);
  });
}

/**
 * Get or create the perpetual memory LanceDB table
 * @returns {Promise<{db: object, table: object, embedFn: Function}>}
 */
async function getStore() {
  const lancedb = await import('@lancedb/lancedb');
  const dbPath = path.resolve(LANCEDB_DIR);
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  const db = await lancedb.connect(dbPath);
  const tableNames = await db.tableNames();

  let table;
  // Try to use the existing MemoryVectorStore embedding pipeline
  const { MemoryVectorStore } = require('../../lib/memory/lancedb-client.cjs');
  const store = new MemoryVectorStore({
    persistDirectory: LANCEDB_DIR,
    collectionName: TABLE_NAME,
  });
  await store.initialize();

  // Use store's embed function
  const embedFn = async text => {
    if (typeof store._embed === 'function') {
      return store._embed(text);
    }
    // Fallback: generate a deterministic test embedding if embed unavailable
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(text).digest();
    const dim = 384;
    const vec = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      vec[i] = (hash[i % hash.length] / 255.0) * 2 - 1;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vec[i] /= norm;
    }
    return Array.from(vec);
  };

  if (tableNames.includes(TABLE_NAME)) {
    table = await db.openTable(TABLE_NAME);
  } else {
    // Create initial table with a dummy record
    const dummyVec = await embedFn('perpetual memory initialized');
    table = await db.createTable(TABLE_NAME, [
      {
        vector: dummyVec,
        text: 'Perpetual memory system initialized',
        category: 'learning',
        agent: 'system',
        taskId: '',
        timestamp: new Date().toISOString(),
        contentHash: require('crypto').createHash('md5').update('init').digest('hex'),
      },
    ]);
  }

  return { db, table, embedFn };
}

/**
 * Check for duplicate content via similarity threshold
 * @param {object} table - LanceDB table
 * @param {number[]} vector - Embedding vector
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {Promise<boolean>} True if duplicate found
 */
async function isDuplicate(table, vector, threshold) {
  try {
    const results = await table.search(vector).limit(1).toArray();
    if (results.length === 0) return false;
    // LanceDB returns _distance (L2 or cosine distance). Lower = more similar.
    // For cosine: similarity = 1 - distance
    const distance = results[0]._distance || 0;
    const similarity = 1 - distance;
    return similarity >= threshold;
  } catch (_e) {
    return false;
  }
}

/**
 * Embed and store text in perpetual memory
 */
async function embedAndStore(text, options) {
  const { agent, taskId, category, dedupThreshold } = options;
  const { table, embedFn } = await getStore();

  // Generate embedding
  const vector = await embedFn(text);

  // Check for duplicates
  if (await isDuplicate(table, vector, dedupThreshold)) {
    return {
      stored: false,
      reason: 'duplicate',
      message: `Content too similar to existing entry (threshold: ${dedupThreshold})`,
    };
  }

  // Auto-categorize if not specified
  const resolvedCategory = category || autoCategorizee(text);

  // Generate content hash for dedup
  const contentHash = require('crypto').createHash('md5').update(text).digest('hex');

  // Store record
  const record = {
    vector,
    text: text.slice(0, 4000), // Cap at 4000 chars
    category: resolvedCategory,
    agent: agent || 'unknown',
    taskId: taskId || '',
    timestamp: new Date().toISOString(),
    contentHash,
  };

  await table.add([record]);

  return {
    stored: true,
    category: resolvedCategory,
    contentHash,
    textLength: text.length,
    message: `Stored in perpetual memory [${resolvedCategory}] (${text.length} chars)`,
  };
}

/**
 * Query perpetual memory by semantic similarity
 */
async function queryMemory(queryText, limit) {
  const { table, embedFn } = await getStore();
  const vector = await embedFn(queryText);
  const results = await table.search(vector).limit(limit).toArray();

  return results.map(r => ({
    text: r.text,
    category: r.category,
    agent: r.agent,
    taskId: r.taskId,
    timestamp: r.timestamp,
    similarity: r._distance != null ? (1 - r._distance).toFixed(3) : 'N/A',
  }));
}

/**
 * Get perpetual memory statistics
 */
async function getStats() {
  try {
    const { table } = await getStore();
    const all = await table.search(new Array(384).fill(0)).limit(10000).toArray();

    const categories = {};
    const agents = {};
    let earliest = null;
    let latest = null;

    for (const row of all) {
      const cat = row.category || 'unknown';
      const ag = row.agent || 'unknown';
      categories[cat] = (categories[cat] || 0) + 1;
      agents[ag] = (agents[ag] || 0) + 1;
      if (row.timestamp) {
        if (!earliest || row.timestamp < earliest) earliest = row.timestamp;
        if (!latest || row.timestamp > latest) latest = row.timestamp;
      }
    }

    return {
      totalRecords: all.length,
      categories,
      agents,
      earliest,
      latest,
      tableName: TABLE_NAME,
      dbPath: LANCEDB_DIR,
    };
  } catch (err) {
    return { error: err.message, totalRecords: 0 };
  }
}

/**
 * Print help
 */
function printHelp() {
  console.log(`Auto-Embed CLI - Perpetual Memory Architecture

Usage:
  node .claude/tools/cli/auto-embed.cjs --text "interaction text"
  node .claude/tools/cli/auto-embed.cjs --text "text" --agent developer --task-id task-5
  echo "text" | node .claude/tools/cli/auto-embed.cjs --stdin
  node .claude/tools/cli/auto-embed.cjs --query "search query" --limit 5
  node .claude/tools/cli/auto-embed.cjs --stats

Options:
  --text <string>             Text to embed and store
  --stdin                     Read text from stdin
  --agent <string>            Agent name (default: unknown)
  --task-id <string>          Associated task ID
  --category <string>         Override auto-categorization
  --query <string>            Semantic search query
  --limit <number>            Max results (default: 10)
  --dedup-threshold <number>  Dedup similarity threshold (default: 0.92)
  --stats                     Show memory statistics
  --help                      Show this help

Categories (auto-detected or manual):
  decision  - Architectural decisions, tradeoffs, rationale
  learning  - Insights, discoveries, things learned
  pattern   - Reusable approaches, techniques, conventions
  gotcha    - Pitfalls, anti-patterns, caveats
  issue     - Bugs, errors, blockers, regressions
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.stats) {
    const stats = await getStats();
    console.log(JSON.stringify(stats, null, 2));
    return 0;
  }

  if (args.query) {
    const results = await queryMemory(args.query, args.limit);
    if (results.length === 0) {
      console.log(`No results found for: "${args.query}"`);
      return 0;
    }
    console.log(`Found ${results.length} results for: "${args.query}"\n`);
    for (const r of results) {
      console.log(
        `[${r.category}] Similarity: ${r.similarity} | Agent: ${r.agent} | ${r.timestamp}`
      );
      console.log(`  ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}\n`);
    }
    return 0;
  }

  // Get text to embed
  let text = args.text;
  if (!text && args.stdin) {
    text = await readStdin();
  }

  if (!text) {
    console.error('Error: No text provided. Use --text "..." or --stdin');
    console.error('Run with --help for usage information.');
    return 1;
  }

  if (text.length < 10) {
    console.error('Error: Text too short (minimum 10 characters)');
    return 1;
  }

  const result = await embedAndStore(text, {
    agent: args.agent,
    taskId: args.taskId,
    category: args.category,
    dedupThreshold: args.dedupThreshold,
  });

  console.log(JSON.stringify(result, null, 2));
  return result.stored ? 0 : 0; // 0 even for dedup (not an error)
}

if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch(err => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { embedAndStore, queryMemory, getStats, autoCategorizee };
