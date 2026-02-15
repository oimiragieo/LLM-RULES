#!/usr/bin/env node
/**
 * Repo RAG - High-recall codebase retrieval using multiple search strategies
 *
 * Usage:
 *   node search.mjs --query "authentication patterns"
 *   node search.mjs --query "class UserService" --type symbol
 *   node search.mjs --query "error handling" --path src/ --limit 20
 *   node search.mjs --query "authentication middleware" --extensions ts,js
 *   node search.mjs --query "payment processing" --format markdown
 *
 * Outputs conforming JSON to skill-repo-rag-output.schema.json
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { formatMarkdown, showHelp, validateOutputSchema } from './search-formatters.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../../..');

// Default configuration
const DEFAULT_LIMIT = 10;
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.mjs', '.cjs', '.vue', '.svelte'];
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'coverage'];

/**
 * Parse command-line arguments
 */
function parseArgs(args) {
  const parsed = {
    query: null,
    path: null,
    limit: DEFAULT_LIMIT,
    type: 'hybrid', // hybrid, keyword, symbol, semantic, path
    extensions: null,
    format: 'json',
    threshold: 0.3, // minimum relevance score
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--query' && args[i + 1]) {
      parsed.query = args[++i];
    } else if (arg === '--path' && args[i + 1]) {
      parsed.path = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      parsed.limit = parseInt(args[++i], 10);
    } else if (arg === '--type' && args[i + 1]) {
      parsed.type = args[++i];
    } else if (arg === '--extensions' && args[i + 1]) {
      parsed.extensions = args[++i]
        .split(',')
        .map(e => (e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`));
    } else if (arg === '--format' && args[i + 1]) {
      parsed.format = args[++i];
    } else if (arg === '--threshold' && args[i + 1]) {
      parsed.threshold = parseFloat(args[++i]);
    }
  }

  return parsed;
}

/**
 * Extract keywords from query
 */
function extractKeywords(query) {
  // Remove common words
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'was',
    'are',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'can',
    'could',
    'may',
    'might',
    'must',
  ]);

  // Split on non-word characters and filter
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)]; // unique keywords
}

/**
 * Generate semantic expansions (simple synonym/related term mapping)
 */
function expandQuerySemantics(query) {
  const expansions = {
    auth: ['authentication', 'authorize', 'login', 'signin', 'session', 'token', 'jwt', 'oauth'],
    authentication: ['auth', 'login', 'signin', 'credential', 'password', 'token'],
    user: ['account', 'profile', 'member', 'customer'],
    error: ['exception', 'failure', 'fault', 'bug', 'issue'],
    handle: ['process', 'manage', 'deal', 'catch'],
    database: ['db', 'storage', 'repository', 'model', 'schema'],
    api: ['endpoint', 'route', 'handler', 'controller', 'service'],
    test: ['spec', 'unittest', 'integration', 'e2e'],
    component: ['widget', 'element', 'module', 'part'],
    function: ['method', 'procedure', 'routine', 'fn'],
    class: ['type', 'interface', 'struct', 'object'],
    config: ['configuration', 'settings', 'options', 'setup'],
  };

  const keywords = extractKeywords(query);
  const expanded = new Set(keywords);

  keywords.forEach(keyword => {
    if (expansions[keyword]) {
      expansions[keyword].forEach(term => expanded.add(term));
    }
  });

  return Array.from(expanded);
}

/**
 * Recursively scan directory for files
 */
async function scanDirectory(dirPath, extensions) {
  const files = [];

  async function scan(currentPath) {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (EXCLUDE_DIRS.includes(entry.name)) continue;
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (extensions.includes(ext)) {
            try {
              const content = await readFile(fullPath, 'utf-8');
              const stats = await stat(fullPath);
              files.push({
                path: fullPath,
                relativePath: relative(PROJECT_ROOT, fullPath),
                content,
                lineCount: content.split('\n').length,
                extension: ext,
                size: stats.size,
              });
            } catch (error) {
              // Skip files that can't be read
              console.error(`Warning: Failed to read ${fullPath}: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
      console.error(`Warning: Failed to scan ${currentPath}: ${error.message}`);
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Extract symbols (functions, classes, types) from file
 */
function extractSymbols(file) {
  const symbols = [];
  const lines = file.content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Function declarations
    const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        type: 'function',
        line: idx + 1,
        signature: trimmed,
      });
    }

    // Arrow functions
    const arrowMatch = trimmed.match(
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/
    );
    if (arrowMatch) {
      symbols.push({
        name: arrowMatch[1],
        type: 'function',
        line: idx + 1,
        signature: trimmed,
      });
    }

    // Class declarations
    const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        type: 'class',
        line: idx + 1,
        signature: trimmed,
      });
    }

    // Interface/Type declarations (TypeScript)
    const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      symbols.push({
        name: interfaceMatch[1],
        type: 'interface',
        line: idx + 1,
        signature: trimmed,
      });
    }

    const typeMatch = trimmed.match(/(?:export\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        type: 'type',
        line: idx + 1,
        signature: trimmed,
      });
    }

    // Python class/function
    if (file.extension === '.py') {
      const pyClassMatch = trimmed.match(/class\s+(\w+)/);
      if (pyClassMatch) {
        symbols.push({
          name: pyClassMatch[1],
          type: 'class',
          line: idx + 1,
          signature: trimmed,
        });
      }

      const pyFuncMatch = trimmed.match(/def\s+(\w+)/);
      if (pyFuncMatch) {
        symbols.push({
          name: pyFuncMatch[1],
          type: 'function',
          line: idx + 1,
          signature: trimmed,
        });
      }
    }
  });

  return symbols;
}

/**
 * Search strategy: Keyword search
 */
function keywordSearch(files, keywords) {
  const results = [];

  files.forEach(file => {
    const lines = file.content.split('\n');
    const lowerContent = file.content.toLowerCase();

    // Calculate keyword matches
    let matchCount = 0;
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) matchCount += matches.length;
    });

    if (matchCount === 0) return;

    // Find specific line matches
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      let lineMatchCount = 0;

      keywords.forEach(keyword => {
        if (lowerLine.includes(keyword)) lineMatchCount++;
      });

      if (lineMatchCount > 0) {
        // Get context (3 lines before and after)
        const contextStart = Math.max(0, idx - 3);
        const contextEnd = Math.min(lines.length, idx + 4);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        // Calculate relevance based on keyword density
        const relevance = Math.min(1.0, lineMatchCount / keywords.length + matchCount / 100);

        results.push({
          file: file.relativePath,
          line: idx + 1,
          column: line.indexOf(keywords[0]) + 1,
          match_type: 'keyword',
          relevance_score: relevance,
          context,
          snippet: line.trim(),
          keywords_matched: keywords.filter(k => lowerLine.includes(k)),
        });
      }
    });
  });

  return results;
}

/**
 * Search strategy: Symbol search
 */
function symbolSearch(files, query) {
  const results = [];
  const queryLower = query.toLowerCase();
  const keywords = extractKeywords(query);

  files.forEach(file => {
    const symbols = extractSymbols(file);

    symbols.forEach(symbol => {
      const nameLower = symbol.name.toLowerCase();
      let matchScore = 0;

      // Exact match
      if (nameLower === queryLower) {
        matchScore = 1.0;
      }
      // Contains query
      else if (nameLower.includes(queryLower)) {
        matchScore = 0.8;
      }
      // Keyword match
      else {
        const matched = keywords.filter(k => nameLower.includes(k));
        if (matched.length > 0) {
          matchScore = 0.5 + (matched.length / keywords.length) * 0.3;
        }
      }

      if (matchScore > 0) {
        // Get context around symbol
        const lines = file.content.split('\n');
        const contextStart = Math.max(0, symbol.line - 4);
        const contextEnd = Math.min(lines.length, symbol.line + 10);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        results.push({
          file: file.relativePath,
          line: symbol.line,
          column: 1,
          match_type: 'symbol',
          relevance_score: matchScore,
          context,
          snippet: symbol.signature,
          symbol: {
            name: symbol.name,
            type: symbol.type,
            signature: symbol.signature,
          },
        });
      }
    });
  });

  return results;
}

/**
 * Search strategy: Semantic search (keyword expansion)
 */
function semanticSearch(files, query) {
  const expandedTerms = expandQuerySemantics(query);
  return keywordSearch(files, expandedTerms);
}

/**
 * Search strategy: Path search
 */
function pathSearch(files, query) {
  const results = [];
  const queryLower = query.toLowerCase();
  const keywords = extractKeywords(query);

  files.forEach(file => {
    const pathLower = file.relativePath.toLowerCase();
    let matchScore = 0;

    // Direct path match
    if (pathLower.includes(queryLower)) {
      matchScore = 0.9;
    }
    // Keyword in path
    else {
      const matched = keywords.filter(k => pathLower.includes(k));
      if (matched.length > 0) {
        matchScore = 0.6 + (matched.length / keywords.length) * 0.3;
      }
    }

    if (matchScore > 0) {
      results.push({
        file: file.relativePath,
        line: 1,
        column: 1,
        match_type: 'path',
        relevance_score: matchScore,
        context: file.content.split('\n').slice(0, 10).join('\n'), // First 10 lines
        snippet: `File path: ${file.relativePath}`,
      });
    }
  });

  return results;
}

/**
 * Hybrid search combining all strategies
 */
function hybridSearch(files, query, keywords) {
  const keywordResults = keywordSearch(files, keywords);
  const symbolResults = symbolSearch(files, query);
  const semanticResults = semanticSearch(files, query);
  const pathResults = pathSearch(files, query);

  // Merge results (deduplicate by file+line)
  const merged = new Map();

  [...keywordResults, ...symbolResults, ...semanticResults, ...pathResults].forEach(result => {
    const key = `${result.file}:${result.line}`;

    if (!merged.has(key)) {
      merged.set(key, result);
    } else {
      // Keep higher relevance score
      const existing = merged.get(key);
      if (result.relevance_score > existing.relevance_score) {
        merged.set(key, result);
      }
    }
  });

  return Array.from(merged.values());
}

/**
 * Execute search based on type
 */
function executeSearch(files, query, type) {
  const keywords = extractKeywords(query);
  const startTime = Date.now();

  let results = [];
  let strategiesUsed = [];

  switch (type) {
    case 'keyword':
      results = keywordSearch(files, keywords);
      strategiesUsed = ['keyword'];
      break;
    case 'symbol':
      results = symbolSearch(files, query);
      strategiesUsed = ['symbol'];
      break;
    case 'semantic':
      results = semanticSearch(files, query);
      strategiesUsed = ['semantic'];
      break;
    case 'path':
      results = pathSearch(files, query);
      strategiesUsed = ['path'];
      break;
    case 'hybrid':
    default:
      results = hybridSearch(files, query, keywords);
      strategiesUsed = ['keyword', 'symbol', 'semantic', 'path'];
      break;
  }

  const duration = Date.now() - startTime;

  return { results, strategiesUsed, duration };
}

/**
 * Rank and filter results
 */
function rankResults(results, limit, threshold) {
  // Sort by relevance (descending)
  const sorted = results.sort((a, b) => b.relevance_score - a.relevance_score);

  // Filter by threshold
  const filtered = sorted.filter(r => r.relevance_score >= threshold);

  // Limit results
  return filtered.slice(0, limit);
}

/**
 * Format output according to schema
 */
function formatOutput(query, files, searchResults, args) {
  const { results, duration } = searchResults;
  const rankedResults = rankResults(results, args.limit, args.threshold);

  return {
    skill_name: 'repo-rag',
    query,
    query_type: args.type,
    results_count: rankedResults.length,
    files_searched: files.map(f => f.relativePath).slice(0, 100),
    semantic_matches: rankedResults.map(r => ({
      file: r.file,
      line_start: r.line,
      line_end: r.line,
      relevance_score: Math.round(r.relevance_score * 100) / 100,
      snippet: r.snippet,
      match_type: r.match_type,
      context: r.context,
    })),
    search_metadata: {
      total_files_scanned: files.length,
      total_lines_analyzed: files.reduce((sum, f) => sum + f.lineCount, 0),
      search_duration_ms: duration,
    },
    filters_applied: {
      file_extensions: args.extensions || DEFAULT_EXTENSIONS,
      directories: args.path ? [args.path] : [],
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query) {
    showHelp();
    process.exit(1);
  }

  try {
    const searchPath = args.path ? join(PROJECT_ROOT, args.path) : PROJECT_ROOT;
    const extensions = args.extensions || DEFAULT_EXTENSIONS;

    // Scan directory for files
    const files = await scanDirectory(searchPath, extensions);

    if (files.length === 0) {
      console.error('No files found to search');
      process.exit(1);
    }

    // Execute search
    const searchResults = executeSearch(files, args.query, args.type);

    // Format output
    const output = formatOutput(args.query, files, searchResults, args);

    // Validate output
    const schemaPath = join(PROJECT_ROOT, 'schemas/skill-repo-rag-output.schema.json');
    const isValid = await validateOutputSchema(output, schemaPath, readFile);

    if (!isValid) {
      console.error('Warning: Output does not conform to schema');
    }

    // Output result
    if (args.format === 'markdown') {
      console.log(formatMarkdown(output));
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath || process.argv[1] === modulePath.replace(/\\/g, '/')) {
    main();
  }
}

export { executeSearch, extractSymbols, keywordSearch, symbolSearch, semanticSearch, pathSearch };
