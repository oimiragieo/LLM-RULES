#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const fsp = require('fs').promises;
const net = require('net');
const path = require('path');
const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');

const DEFAULT_PORT = Number(process.env.HYBRID_DAEMON_PORT || 47653);
const DEFAULT_HOST = process.env.HYBRID_DAEMON_HOST || '127.0.0.1';
const IDLE_TIMEOUT_MS = Number(process.env.HYBRID_DAEMON_IDLE_MS || 10 * 60 * 1000);
const PREWARM_ON_START = process.env.HYBRID_DAEMON_PREWARM === 'true';
const PROJECT_ROOT = process.cwd();
const STATE_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'code-index');
const STATE_FILE = path.join(STATE_DIR, 'hybrid-search-daemon.json');

function parsePortArg(argv) {
  const idx = argv.indexOf('--port');
  if (idx === -1) return DEFAULT_PORT;
  const value = Number(argv[idx + 1]);
  return Number.isFinite(value) ? value : DEFAULT_PORT;
}

async function writeState(port) {
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.writeFile(
    STATE_FILE,
    JSON.stringify(
      {
        pid: process.pid,
        host: DEFAULT_HOST,
        port,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

async function clearState() {
  try {
    await fsp.unlink(STATE_FILE);
  } catch (_e) {
    // state file may not exist
    void _e;
  }
}

async function main() {
  const port = parsePortArg(process.argv.slice(2));
  const indexer = new HybridLazyIndexer({
    embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
  });

  let idleTimer = null;

  const prewarm = async () => {
    const start = Date.now();
    try {
      await indexer.getRgPath();
      await indexer.initLanceDB();
      if (process.env.HYBRID_EMBEDDINGS !== 'off') {
        try {
          await indexer.semanticSearch('function', { limit: 1 });
        } catch (_err) {
          // Fail-open: daemon still serves text search even if semantic warmup fails
          void _err;
        }
      }
      return { ok: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      await clearState();
      process.exit(0);
    }, IDLE_TIMEOUT_MS);
    idleTimer.unref();
  };

  const server = net.createServer(socket => {
    resetIdleTimer();
    socket.setEncoding('utf8');
    let buffer = '';

    socket.on('data', async chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let req;
        try {
          req = safeParseJSON(line);
        } catch {
          socket.write(`${JSON.stringify({ ok: false, error: 'Invalid JSON request' })}\n`);
          continue;
        }

        const started = Date.now();
        try {
          let result;
          const command = req.command;
          const args = req.args || {};

          if (command === 'search') {
            result = await indexer.search(String(args.query || ''), {
              limit: Number(args.limit || 20),
            });
          } else if (command === 'structure') {
            result = await indexer.analyzeStructure();
          } else if (command === 'file') {
            result = await indexer.getFileContent(
              String(args.filePath || ''),
              Number(args.start || 0),
              Number(args.end || 50)
            );
          } else if (command === 'stats') {
            const base = indexer.getStats();
            result = {
              ...base,
              cache: indexer.queryCache ? indexer.queryCache.getStats() : { enabled: false },
            };
          } else if (command === 'cache-stats') {
            result = indexer.queryCache ? indexer.queryCache.getStats() : { enabled: false };
          } else if (command === 'cache-clear') {
            if (indexer.queryCache) indexer.queryCache.clear();
            result = { cleared: true };
          } else if (command === 'shutdown') {
            socket.write(
              `${JSON.stringify({
                id: req.id || null,
                ok: true,
                result: { shuttingDown: true },
                durationMs: Date.now() - started,
              })}\n`
            );
            await clearState();
            server.close(() => process.exit(0));
            return;
          } else if (command === 'prewarm') {
            result = await prewarm();
          } else {
            throw new Error(`Unsupported command: ${command}`);
          }

          socket.write(
            `${JSON.stringify({
              id: req.id || null,
              ok: true,
              result,
              durationMs: Date.now() - started,
            })}\n`
          );
        } catch (err) {
          socket.write(
            `${JSON.stringify({
              id: req.id || null,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - started,
            })}\n`
          );
        }
      }
    });
  });

  server.on('error', err => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[hybrid-daemon] Server error: ${msg}\n`);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await clearState();
    server.close(() => process.exit(0));
  });
  process.on('SIGTERM', async () => {
    await clearState();
    server.close(() => process.exit(0));
  });
  process.on('exit', () => {
    try {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
    } catch (_e) {
      // best-effort cleanup on exit
      void _e;
    }
  });

  server.listen(port, DEFAULT_HOST, async () => {
    await writeState(port);
    resetIdleTimer();
    if (PREWARM_ON_START) {
      void prewarm();
    }
  });
}

const wrappedMain = wrapCLITool(main, 'hybrid-search-daemon');

if (require.main === module) {
  wrappedMain();
}
