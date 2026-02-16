#!/usr/bin/env node
/**
 * Hybrid Search CLI - ripgrep + Embeddings
 *
 * Usage:
 *   hybrid-search "authentication logic"       # Search code
 *   hybrid-search --structure                  # Show project structure
 *   hybrid-search --file "src/auth.ts" 10 20   # Get file content
 */

'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');

const chalk = {
  blue: text => `\x1b[34m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
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
        resolve(JSON.parse(line));
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
  } catch {
    console.log(chalk.yellow('Hybrid search daemon is not running.'));
  }
}

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

    console.log(chalk.bold('\nEntry Points (Exports):'));
    structure.entryPoints.slice(0, 10).forEach(ep => {
      console.log(`  ${chalk.green(ep.file)}:${ep.line} ${ep.code.slice(0, 60)}`);
    });

    console.log(chalk.bold('\nTop Dependencies:'));
    structure.dependencies.slice(0, 10).forEach(([dep, count]) => {
      console.log(`  ${chalk.yellow(dep)} (${count} imports)`);
    });

    console.log(chalk.bold('\nMermaid Diagram:'));
    console.log(chalk.gray('```mermaid'));
    console.log(structure.diagram);
    console.log(chalk.gray('```'));
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
  hybrid-search --structure          # Show project structure
  hybrid-search --file path 10 20    # Get file content (lines 10-20)

Environment:
  HYBRID_EMBEDDINGS=off              # Disable semantic search (text only)
  HYBRID_SEARCH_DAEMON=off           # Disable daemon and run directly

Examples:
  hybrid-search "authentication"
  hybrid-search "export class User"
  hybrid-search --structure
  hybrid-search --file src/auth.ts 1 50
  hybrid-search --daemon status
  hybrid-search --daemon prewarm
  hybrid-search --daemon stop
`);
  }
}

const wrappedMain = wrapCLITool(main, 'hybrid-search');

if (require.main === module) {
  wrappedMain();
}
