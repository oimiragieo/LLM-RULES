/**
 * JSONL helpers with optional rotation.
 *
 * Best-effort only: never throws for caller stability.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function trimJsonlFile(filePath, maxLines) {
  if (!maxLines || !Number.isFinite(maxLines) || maxLines <= 0) return;
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  if (lines.length <= maxLines) return;

  const trimmed = lines.slice(-maxLines).join('\n') + '\n';
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, trimmed, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function appendJsonl(filePath, entry, options = {}) {
  try {
    const maxLines = Number(options.maxLines || 0);
    ensureDirForFile(filePath);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    if (maxLines > 0) {
      trimJsonlFile(filePath, maxLines);
    }
  } catch (_err) {
    // Best-effort: never throw
  }
}

module.exports = {
  appendJsonl,
  trimJsonlFile,
};
