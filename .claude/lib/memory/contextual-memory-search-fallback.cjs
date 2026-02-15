// .claude/lib/memory/contextual-memory-search-fallback.cjs

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveRipgrepBinary, resolveAstGrepBinary } = require('../utils/binary-resolver.cjs');

function getRipgrepPath(memory) {
  if (memory._resolvedRipgrepPath !== undefined) return memory._resolvedRipgrepPath;

  let vscodeRgPath = null;
  try {
    const { rgPath } = require('@vscode/ripgrep');
    vscodeRgPath = rgPath;
  } catch {
    // Ignore and use resolver fallbacks.
  }

  memory._resolvedRipgrepPath = resolveRipgrepBinary({
    projectRoot: memory.config.projectRoot || process.cwd(),
    preferredPath: process.env.RG_BIN,
    vscodeRgPath,
  });

  return memory._resolvedRipgrepPath;
}

function getAstGrepPath(memory) {
  if (memory._resolvedAstGrepPath !== undefined) return memory._resolvedAstGrepPath;
  memory._resolvedAstGrepPath = resolveAstGrepBinary({
    projectRoot: memory.config.projectRoot || process.cwd(),
    preferredPath: process.env.AST_GREP_BIN,
  });
  return memory._resolvedAstGrepPath || 'ast-grep';
}

function checkBinaryAvailable(binPath) {
  return new Promise(resolve => {
    const proc = spawn(binPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    proc.on('error', () => resolve(false));
    proc.on('close', code => resolve(code === 0));
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

function searchWithRipgrep(memory, query, files, limit) {
  const rgPath = memory._getRipgrepPath();
  if (!rgPath) return Promise.resolve([]);

  return checkBinaryAvailable(rgPath).then(available => {
    if (!available) return [];

    const memoryDir = memory.config.memoryDir;
    const candidates = [];

    const args = ['-i', '-n', '-C', '2', '--', query];

    for (const rel of files) {
      const abs = path.join(memoryDir, rel);
      if (fs.existsSync(abs)) {
        args.push(abs);
      }
    }

    if (args.length === 5) return [];

    return new Promise(resolve => {
      const proc = spawn(rgPath, args, {
        cwd: memoryDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.on('close', code => {
        if (code !== 0 && code !== 1) {
          resolve([]);
          return;
        }

        const lines = stdout.split('\n').filter(l => l.trim());
        for (const line of lines.slice(0, limit * 3)) {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) continue;
          const [, filePath, , content] = match;
          const rel = path.relative(memoryDir, filePath).replace(/\\/g, '/');
          candidates.push({
            content: content.trim(),
            metadata: { path: rel },
            similarity: null,
            source: 'ripgrep',
          });
        }

        resolve(candidates.slice(0, limit));
      });

      proc.on('error', () => resolve([]));
    });
  });
}

async function keywordSearch(memory, query, options = {}) {
  const limit = typeof options.limit === 'number' ? options.limit : 5;
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return [];

  const files = [
    'learnings.md',
    'decisions.md',
    'issues.md',
    'active_context.md',
    'gotchas.json',
    'patterns.json',
    'codebase_map.json',
  ];

  for (const dir of ['mtm']) {
    const absDir = path.join(memory.config.memoryDir, dir);
    try {
      if (!fs.existsSync(absDir)) continue;
      const names = fs
        .readdirSync(absDir)
        .filter(n => n.endsWith('.json'))
        .sort()
        .slice(-10);
      for (const n of names) files.push(path.join(dir, n));
    } catch {
      // ignore
    }
  }

  const ripgrepResults = await memory._searchWithRipgrep(q, files, limit);
  if (ripgrepResults.length > 0) {
    return ripgrepResults;
  }

  const candidates = [];
  const MAX_BYTES = 80_000;

  for (const rel of files) {
    const abs = path.join(memory.config.memoryDir, rel);
    try {
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      const start = stat.size > MAX_BYTES ? stat.size - MAX_BYTES : 0;
      const fd = fs.openSync(abs, 'r');
      try {
        const buf = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        const text = buf.toString('utf8');
        const lower = text.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx === -1) continue;

        const snippetStart = Math.max(0, idx - 100);
        const snippetEnd = Math.min(text.length, idx + q.length + 300);
        const snippet = text.slice(snippetStart, snippetEnd).trim();

        candidates.push({
          content: snippet,
          metadata: { path: rel },
          similarity: null,
          source: 'keyword',
        });
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // ignore unreadable file
    }
  }

  return candidates.slice(0, limit);
}

module.exports = {
  checkBinaryAvailable,
  getAstGrepPath,
  getRipgrepPath,
  keywordSearch,
  searchWithRipgrep,
};
