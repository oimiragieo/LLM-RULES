#!/usr/bin/env node
/**
 * Hybrid Search CLI - ripgrep + Embeddings
 *
 * Usage:
 *   hybrid-search "authentication logic"       # Search code
 *   hybrid-search --structure                  # Show project structure
 *   hybrid-search --file "src/auth.ts" 10 20   # Get file content
 *   hybrid-search --compress "query"           # Search + compress + dedup (JSON)
 */

/* eslint-disable max-lines -- CLI with many subcommands and helpers */
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');

const chalk = {
  blue: text => `\x1b[34m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  gray: text => `\x1b[90m${text}\x1b[0m`,
  bold: text => `\x1b[1m${text}\x1b[0m`,
};

const DAEMON_HOST = process.env.HYBRID_DAEMON_HOST || '127.0.0.1';
const DAEMON_PORT = Number(process.env.HYBRID_DAEMON_PORT || 47653);
const DAEMON_TIMEOUT_MS = Number(process.env.HYBRID_DAEMON_TIMEOUT_MS || 3000);
const DAEMON_ENABLED = process.env.HYBRID_SEARCH_DAEMON !== 'off';

function supportsDaemonCommand(command) {
  return command !== '--help' && command !== '-h';
}

function shouldUseDaemon(command) {
  if (!DAEMON_ENABLED) return false;
  if (!supportsDaemonCommand(command)) return false;
  return true;
}

function daemonRequest(payload, timeoutMs = DAEMON_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: DAEMON_HOST, port: DAEMON_PORT });
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Daemon timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setEncoding('utf8');
    socket.once('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('data', chunk => {
      buffer += chunk;
      const idx = buffer.indexOf('\n');
      if (idx === -1) return;
      const line = buffer.slice(0, idx);
      clearTimeout(timer);
      socket.end();
      try {
        resolve(safeParseJSON(line));
      } catch (err) {
        reject(err);
      }
    });
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
  });
}

function startDaemonDetached() {
  const daemonScript = path.join(__dirname, 'hybrid-search-daemon.cjs');
  const child = spawn(process.execPath, [daemonScript, '--port', String(DAEMON_PORT)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function daemonCall(payload) {
  try {
    const resp = await daemonRequest(payload);
    if (!resp?.ok) {
      throw new Error(resp?.error || 'Hybrid daemon error');
    }
    return resp;
  } catch {
    startDaemonDetached();
    // Give daemon a short time to bind before retrying.
    await new Promise(resolve => setTimeout(resolve, 180));
    const resp = await daemonRequest(payload);
    if (!resp?.ok) {
      throw new Error(resp?.error || 'Hybrid daemon error');
    }
    return resp;
  }
}

async function stopDaemon() {
  try {
    const resp = await daemonRequest({ id: Date.now(), command: 'shutdown' }, 1500);
    if (resp?.ok) {
      console.log(chalk.green('Hybrid search daemon stopped.'));
      return;
    }
    console.log(chalk.yellow(`Daemon responded with error: ${resp?.error || 'unknown error'}`));
  } catch {
    console.log(chalk.yellow('Hybrid search daemon is not running.'));
  }
}

async function prewarmDaemon() {
  try {
    const resp = await daemonCall({ id: Date.now(), command: 'prewarm' });
    const details = resp?.result || {};
    if (details.ok) {
      console.log(chalk.green(`Hybrid search daemon prewarmed in ${details.durationMs}ms.`));
    } else {
      console.log(
        chalk.yellow(
          `Hybrid search daemon prewarm partially failed in ${details.durationMs || 0}ms: ${
            details.error || 'unknown error'
          }`
        )
      );
    }
  } catch (err) {
    console.log(
      chalk.yellow(
        `Hybrid search daemon prewarm failed: ${err instanceof Error ? err.message : String(err)}`
      )
    );
    process.exit(1);
  }
}

async function daemonStatus() {
  try {
    const resp = await daemonRequest({ id: Date.now(), command: 'stats' }, 1500);
    if (!resp?.ok) {
      console.log(chalk.yellow(`Hybrid search daemon error: ${resp?.error || 'unknown error'}`));
      return;
    }
    console.log(chalk.green('Hybrid search daemon is running.'));
    const stats = resp.result || {};
    console.log(chalk.gray(`  cache entries: ${stats.ripgrepCacheSize || 0}`));
    console.log(chalk.gray(`  semantic cache: ${stats.semanticCacheSize || 0}`));
    console.log(chalk.gray(`  embedding cache: ${stats.embeddingCacheSize || 0}`));
    console.log(chalk.gray(`  embed queue: ${stats.embedQueueLength || 0}`));
    console.log(chalk.gray(`  lancedb connected: ${stats.lanceDBConnected ? 'yes' : 'no'}`));
    if (stats.cache) {
      console.log(
        chalk.gray(
          `  query cache: ${stats.cache.entries || 0} entries, ${stats.cache.hits || 0} hits, ${stats.cache.misses || 0} misses`
        )
      );
    }
  } catch {
    console.log(chalk.yellow('Hybrid search daemon is not running.'));
  }
}

/* eslint-disable complexity -- main CLI dispatch with many subcommands */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const daemonCmd = args[1];

  if (command === '--daemon') {
    if (daemonCmd === 'stop') {
      await stopDaemon();
      return;
    }
    if (daemonCmd === 'status') {
      await daemonStatus();
      return;
    }
    if (daemonCmd === 'prewarm') {
      await prewarmDaemon();
      return;
    }
    console.log('Usage: hybrid-search --daemon status|stop|prewarm');
    process.exit(1);
  }

  if (command === '--cache-stats') {
    if (DAEMON_ENABLED) {
      try {
        const resp = await daemonCall({ id: Date.now(), command: 'cache-stats' });
        const stats = resp.result || {};
        console.log(chalk.blue('\nQuery Cache Statistics\n'));
        console.log(chalk.gray(`  enabled:  ${stats.enabled !== false ? 'yes' : 'no'}`));
        console.log(chalk.gray(`  entries:  ${stats.entries || 0}`));
        console.log(chalk.gray(`  hits:     ${stats.hits || 0}`));
        console.log(chalk.gray(`  misses:   ${stats.misses || 0}`));
        const total = (stats.hits || 0) + (stats.misses || 0);
        const hitRate = total > 0 ? (((stats.hits || 0) / total) * 100).toFixed(1) : '0.0';
        console.log(chalk.gray(`  hit rate: ${hitRate}%`));
        return;
      } catch {
        // Daemon not running — fall through to local indexer
      }
    }
    const localIndexer = new HybridLazyIndexer({
      embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
    });
    const stats = localIndexer.queryCache ? localIndexer.queryCache.getStats() : { enabled: false };
    console.log(chalk.blue('\nQuery Cache Statistics (local)\n'));
    console.log(chalk.gray(`  enabled:  ${stats.enabled !== false ? 'yes' : 'no'}`));
    console.log(chalk.gray(`  entries:  ${stats.entries || 0}`));
    console.log(chalk.gray(`  hits:     ${stats.hits || 0}`));
    console.log(chalk.gray(`  misses:   ${stats.misses || 0}`));
    console.log(chalk.yellow('  (fresh indexer — no accumulated stats)'));
    return;
  }

  if (command === '--cache-clear') {
    if (DAEMON_ENABLED) {
      try {
        const resp = await daemonCall({ id: Date.now(), command: 'cache-clear' });
        if (resp.result?.cleared) {
          console.log(chalk.green('Query cache cleared on daemon.'));
        }
        return;
      } catch {
        // Daemon not running — fall through to local
      }
    }
    console.log(chalk.yellow('Daemon not running. Nothing to clear.'));
    return;
  }

  const useDaemon = shouldUseDaemon(command);
  const indexer = useDaemon
    ? null
    : new HybridLazyIndexer({
        embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
      });

  if (command === '--structure' || command === '-s') {
    // Show project structure
    console.log(chalk.blue('\n📁 Project Structure\n'));
    const structure = useDaemon
      ? (await daemonCall({ id: Date.now(), command: 'structure', args: {} })).result
      : await indexer.analyzeStructure();

    console.log(chalk.bold('Directory Tree:'));
    console.log(structure.tree);

    console.log(chalk.bold('\nEntry Points (Exports/module.exports):'));
    structure.entryPoints.slice(0, 15).forEach(ep => {
      console.log(`  ${chalk.green(ep.file)}:${ep.line} ${ep.code.slice(0, 60)}`);
    });
    if (structure.entryPoints.length > 15) {
      console.log(chalk.gray(`  ... and ${structure.entryPoints.length - 15} more`));
    }

    console.log(chalk.bold('\nTop Dependencies (imports + require):'));
    structure.dependencies.slice(0, 15).forEach(([dep, count]) => {
      const icon = dep.startsWith('.') || dep.startsWith('/') ? '📁' : '📦';
      console.log(`  ${icon} ${chalk.yellow(dep)} (${count})`);
    });

    console.log(chalk.bold('\nMermaid Diagram:'));
    console.log(chalk.gray('```mermaid'));
    console.log(structure.diagram);
    console.log(chalk.gray('```'));
  } else if (command === '--tokens' || command === '-t') {
    // Token estimation for files and directories
    const targetPath = args[1] || '.';
    const fsSync = require('fs');
    const pathMod = require('path');
    const resolved = pathMod.resolve(targetPath);
    const CHARS_PER_TOKEN = 4; // Conservative estimate for code

    function formatSize(bytes) {
      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }
    function formatTokens(tokens) {
      if (tokens < 1000) return `${tokens}`;
      if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    function tokenBudgetWarning(tokens) {
      if (tokens > 100000) return chalk.red(' ⚠ OVER CONTEXT — must use search:code or compress');
      if (tokens > 32000) return chalk.yellow(' ⚠ LARGE — prefer search:code over full Read');
      if (tokens > 8000)
        return chalk.yellow(' △ MEDIUM — consider targeted Read with offset/limit');
      return chalk.green(' ✓ OK to Read directly');
    }

    if (fsSync.statSync(resolved).isFile()) {
      // Single file token estimate
      const stat = fsSync.statSync(resolved);
      const tokens = Math.ceil(stat.size / CHARS_PER_TOKEN);
      const lines = fsSync.readFileSync(resolved, 'utf8').split('\n').length;
      const rel = pathMod.relative(process.cwd(), resolved);
      console.log(chalk.blue(`\n📊 Token Estimate: ${rel}\n`));
      console.log(`  Size:    ${formatSize(stat.size)}`);
      console.log(`  Lines:   ${lines}`);
      console.log(`  Tokens:  ~${formatTokens(tokens)} tokens`);
      console.log(`  Advice: ${tokenBudgetWarning(tokens)}`);

      if (tokens > 15000) {
        const suggestedParts = Math.ceil(tokens / 8000);
        const rawName = pathMod.basename(resolved).replace(/\.[^.]+$/, '');
        const name = rawName.replace(/[-.](?:core|impl|main|index|helpers|utils)$/, '') || rawName;
        const ext = pathMod.extname(resolved);
        console.log('');
        console.log(
          chalk.red(`  ✂ REFACTOR RECOMMENDED: This file is ${formatTokens(tokens)} tokens.`)
        );
        console.log(
          chalk.yellow(`    AI agents struggle with files >15K tokens in a single Read.`)
        );
        console.log(
          chalk.yellow(`    Consider splitting into ~${suggestedParts} modules of ~8K tokens:`)
        );
        if (suggestedParts > 3) {
          console.log(
            chalk.gray(`      ${name}${ext}             — thin facade (re-exports sub-modules)`)
          );
          console.log(chalk.gray(`      ${name}-core${ext}        — main class/exports`));
          console.log(chalk.gray(`      ${name}-helpers${ext}     — utility functions`));
          console.log(chalk.gray(`      ${name}-operations${ext}  — heavy methods`));
        } else {
          console.log(chalk.gray(`      ${name}${ext}          — thin facade (re-exports)`));
          console.log(chalk.gray(`      ${name}-impl${ext}     — main logic`));
          console.log(chalk.gray(`      ${name}-helpers${ext}  — extracted helpers`));
        }
      }
    } else {
      // Directory token estimate — scan all source files
      console.log(chalk.blue(`\n📊 Token Budget Analysis: ${targetPath}\n`));

      const codeExts = new Set([
        '.js',
        '.cjs',
        '.mjs',
        '.ts',
        '.mts',
        '.cts',
        '.jsx',
        '.tsx',
        '.json',
        '.yaml',
        '.yml',
        '.md',
        '.css',
        '.html',
        '.py',
        '.sh',
      ]);
      const skipDirs = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        'coverage',
        'local_cache',
        '.tmp',
      ]);

      const dirStats = {};
      const allFilesList = [];
      let totalBytes = 0;
      let totalFiles = 0;

      function walk(dir, depth) {
        if (depth > 6) return;
        let entries;
        try {
          entries = fsSync.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (skipDirs.has(entry.name)) continue;
          const full = pathMod.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (entry.isFile()) {
            const ext = pathMod.extname(entry.name).toLowerCase();
            if (!codeExts.has(ext)) continue;
            try {
              const stat = fsSync.statSync(full);
              if (stat.size > 1024 * 1024) continue; // Skip files > 1MB
              const rel = pathMod.relative(resolved, full).replace(/\\/g, '/');
              const dirKey = rel.includes('/') ? rel.split('/').slice(0, 2).join('/') : '(root)';
              if (!dirStats[dirKey])
                dirStats[dirKey] = { bytes: 0, files: 0, largest: null, largestSize: 0 };
              dirStats[dirKey].bytes += stat.size;
              dirStats[dirKey].files += 1;
              if (stat.size > dirStats[dirKey].largestSize) {
                dirStats[dirKey].largestSize = stat.size;
                dirStats[dirKey].largest = rel;
              }
              allFilesList.push({
                file: rel,
                size: stat.size,
                tokens: Math.ceil(stat.size / CHARS_PER_TOKEN),
              });
              totalBytes += stat.size;
              totalFiles += 1;
            } catch {
              /* skip */
            }
          }
        }
      }
      walk(resolved, 0);

      // Sort by token count descending
      const sorted = Object.entries(dirStats)
        .map(([dir, s]) => ({ dir, ...s, tokens: Math.ceil(s.bytes / CHARS_PER_TOKEN) }))
        .sort((a, b) => b.tokens - a.tokens);

      const totalTokens = Math.ceil(totalBytes / CHARS_PER_TOKEN);

      console.log(chalk.bold('Overall:'));
      console.log(`  Total files:  ${totalFiles}`);
      console.log(`  Total size:   ${formatSize(totalBytes)}`);
      console.log(`  Total tokens: ~${formatTokens(totalTokens)} tokens`);
      console.log(`  Advice:       ${tokenBudgetWarning(totalTokens)}`);

      console.log(chalk.bold('\nBy Directory (top 20):'));
      console.log(
        chalk.gray('  Directory                              Files    Size     ~Tokens  Advice')
      );
      console.log(chalk.gray('  ' + '─'.repeat(85)));

      sorted.slice(0, 20).forEach(d => {
        const dirPad = d.dir.padEnd(40).slice(0, 40);
        const filesPad = String(d.files).padStart(5);
        const sizePad = formatSize(d.bytes).padStart(8);
        const tokensPad = formatTokens(d.tokens).padStart(8);
        const advice =
          d.tokens > 32000
            ? chalk.yellow('search')
            : d.tokens > 8000
              ? chalk.yellow('offset')
              : chalk.green('read');
        console.log(`  ${dirPad} ${filesPad} ${sizePad} ${tokensPad}  ${advice}`);
      });

      // Sort all files by size for the largest files section
      const bigFiles = allFilesList.sort((a, b) => b.tokens - a.tokens).slice(0, 15);

      console.log(chalk.bold('\nLargest Files:'));
      console.log(
        chalk.gray(
          '  File                                                         Size     ~Tokens  Action'
        )
      );
      console.log(chalk.gray('  ' + '─'.repeat(90)));

      bigFiles.forEach(f => {
        const filePad = f.file.padEnd(60).slice(0, 60);
        const sizePad = formatSize(f.size).padStart(8);
        const tokensPad = formatTokens(f.tokens).padStart(8);
        console.log(`  ${filePad} ${sizePad} ${tokensPad}${tokenBudgetWarning(f.tokens)}`);
      });

      // Refactoring recommendations for oversized SOURCE CODE files only
      const SPLIT_THRESHOLD = 15000; // tokens — recommend splitting above this
      const sourceExts = new Set([
        '.js',
        '.cjs',
        '.mjs',
        '.ts',
        '.mts',
        '.cts',
        '.jsx',
        '.tsx',
        '.py',
      ]);
      const skipPaths = [
        '_archive',
        'node_modules',
        '.git',
        'pnpm-lock',
        'context/data',
        'context/memory/archive',
        'context/reports',
        'context/code-index',
      ];
      const splitCandidates = allFilesList.filter(f => {
        if (f.tokens <= SPLIT_THRESHOLD) return false;
        const ext = pathMod.extname(f.file).toLowerCase();
        if (!sourceExts.has(ext)) return false; // Only source code, not JSON/YAML/MD data files
        if (skipPaths.some(p => f.file.includes(p))) return false; // Skip archives/generated data
        return true;
      });
      if (splitCandidates.length > 0) {
        console.log(chalk.bold('\nRefactor Candidates (>15K tokens — consider splitting):'));
        console.log(chalk.gray('  Files above this threshold are hard for AI agents to work with'));
        console.log(chalk.gray('  in a single Read. Split into focused modules.\n'));

        splitCandidates.slice(0, 10).forEach(f => {
          const tokens = f.tokens;
          const suggestedParts = Math.ceil(tokens / 8000); // target ~8K tokens per module
          const ext = f.file.match(/\.[^.]+$/)?.[0] || '.cjs';

          console.log(`  ${chalk.red(f.file)} (${formatTokens(tokens)} tokens)`);
          console.log(
            chalk.yellow(`    Split into ~${suggestedParts} modules of ~8K tokens each:`)
          );

          // Generate smart split suggestions — strip existing suffixes to avoid stutter
          const rawName = f.file
            .split('/')
            .pop()
            .replace(/\.[^.]+$/, '');
          const name =
            rawName.replace(/[-.](?:core|impl|main|index|helpers|utils)$/, '') || rawName;

          if (tokens > 30000) {
            console.log(
              chalk.gray(`      ${name}${ext}             — thin facade (re-exports sub-modules)`)
            );
            console.log(chalk.gray(`      ${name}-core${ext}        — main class/exports`));
            console.log(chalk.gray(`      ${name}-helpers${ext}     — utility functions`));
            console.log(chalk.gray(`      ${name}-operations${ext}  — heavy methods`));
            if (suggestedParts > 4) {
              console.log(
                chalk.gray(`      ${name}-config${ext}      — constants, defaults, schemas`)
              );
            }
          } else {
            console.log(chalk.gray(`      ${name}${ext}          — thin facade (re-exports)`));
            console.log(chalk.gray(`      ${name}-impl${ext}     — main logic`));
            console.log(chalk.gray(`      ${name}-helpers${ext}  — extracted helpers`));
          }
          console.log();
        });

        console.log(
          chalk.gray('  Pattern: Keep a thin facade module that re-exports from sub-modules.')
        );
        console.log(chalk.gray('  Example: routing-table.cjs → requires routing-table-data.cjs'));
        console.log(
          chalk.gray('           index-manager.cjs → requires index-manager-operations.cjs')
        );
      }

      console.log(chalk.bold('\nToken Budget Legend:'));
      console.log(chalk.green('  ✓ OK       <8K tokens  — safe to Read entire file'));
      console.log(chalk.yellow('  △ MEDIUM   8-32K       — use Read with offset/limit'));
      console.log(chalk.yellow('  ⚠ LARGE    32-100K     — prefer search:code over full Read'));
      console.log(chalk.red('  ⚠ OVER     >100K       — MUST use search:code or compress'));
      console.log(chalk.red('  ✂ SPLIT    >15K        — recommend splitting into smaller modules'));
    }
  } else if (command === '--file' || command === '-f') {
    // Get file content
    const [filePath, start, end] = args.slice(1);
    const content = useDaemon
      ? (
          await daemonCall({
            id: Date.now(),
            command: 'file',
            args: {
              filePath,
              start: parseInt(start) || 0,
              end: parseInt(end) || 50,
            },
          })
        ).result
      : await indexer.getFileContent(filePath, parseInt(start) || 0, parseInt(end) || 50);

    if (content) {
      console.log(chalk.blue(`\n📄 ${filePath} (lines ${content.lineStart}-${content.lineEnd})\n`));
      console.log(content.content);
    } else {
      console.error(chalk.bold('\n❌ File not found or unreadable\n'));
      process.exit(1);
    }
  } else if (command === '--compress' || command === '-c') {
    const query = args.slice(1).join(' ').trim();
    if (!query) {
      console.error(JSON.stringify({ ok: false, error: 'query is required for --compress' }));
      process.exit(1);
    }

    // Import token-saver main function
    const tokenSaverPath = path.resolve(
      __dirname,
      '../../skills/context-compressor/scripts/main.cjs'
    );
    const { main: tokenSaverMain } = require(tokenSaverPath);

    // Parse optional args
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 10;

    const result = tokenSaverMain({
      query,
      mode: 'evidence_aware',
      limit,
      failOnInsufficientEvidence: false,
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } else if (command) {
    // Search
    const query = args.join(' ');
    const startTime = Date.now();

    console.log(chalk.blue(`\n🔍 Searching: "${query}"\n`));

    const results = useDaemon
      ? (await daemonCall({ id: Date.now(), command: 'search', args: { query, limit: 20 } })).result
      : await indexer.search(query, { limit: 20 });

    if (results.length === 0) {
      console.log(chalk.yellow('No results found.\n'));
      process.exit(0);
    }

    results.forEach((result, i) => {
      const score = (result.totalScore * 100).toFixed(1);
      const type = result.type === 'hybrid' ? '⚡' : result.type === 'semantic' ? '🧠' : '📝';

      console.log(`${type} ${chalk.bold(`${i + 1}. ${result.file}`)} ${chalk.gray(`(${score}%)`)}`);

      if (result.textMatches && result.textMatches.length > 0) {
        result.textMatches.slice(0, 3).forEach(m => {
          console.log(chalk.gray(`   ${m.line}: ${m.text.slice(0, 80)}`));
        });
      }
      console.log();
    });

    console.log(chalk.green(`Found ${results.length} results in ${Date.now() - startTime}ms\n`));
  } else {
    // Help
    console.log(`
Hybrid Search - Fast ripgrep + Semantic Embeddings

Usage:
  hybrid-search "query"              # Search codebase
  hybrid-search --structure          # Show project structure + deps + Mermaid
  hybrid-search --tokens [path]      # Token budget analysis for file or directory
  hybrid-search --file path 10 20    # Get file content (lines 10-20)
  hybrid-search --compress "query"   # Search + compress + dedup (JSON output)
  hybrid-search --cache-stats        # Show query cache statistics
  hybrid-search --cache-clear        # Clear query cache on daemon

Environment:
  HYBRID_EMBEDDINGS=on               # Semantic search (default, requires index)
  HYBRID_EMBEDDINGS=off              # Text-only search (no index needed)
  HYBRID_SEARCH_DAEMON=on            # Persistent daemon for fast repeated queries

Examples:
  hybrid-search "authentication"
  hybrid-search "export class User"
  hybrid-search --structure
  hybrid-search --tokens .claude/lib
  hybrid-search --tokens .claude/lib/routing/router-state.cjs
  hybrid-search --file src/auth.ts 1 50
  hybrid-search --compress "authentication" --limit 5
  hybrid-search --daemon status
  hybrid-search --cache-stats
`);
  }
}

const wrappedMain = wrapCLITool(main, 'hybrid-search');

if (require.main === module) {
  wrappedMain();
}
