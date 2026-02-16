#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const DEFAULT_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'flight-recorder.jsonl'
);
const DEFAULT_MAX_BYTES = Number(process.env.FLIGHT_RECORDER_MAX_BYTES || 5 * 1024 * 1024);
const DEFAULT_MAX_FILES = Number(process.env.FLIGHT_RECORDER_MAX_FILES || 20);
const DEFAULT_RETENTION_DAYS = Number(process.env.FLIGHT_RECORDER_RETENTION_DAYS || 7);
const ROTATED_SUFFIX_RE = /\.flight-recorder\.\d{13}\.jsonl$/;

function parseBool(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }

  return {
    file: map.get('--file') || DEFAULT_FILE,
    maxBytes: map.has('--max-bytes') ? Number(map.get('--max-bytes')) : DEFAULT_MAX_BYTES,
    maxFiles: map.has('--max-files') ? Number(map.get('--max-files')) : DEFAULT_MAX_FILES,
    retentionDays: map.has('--retention-days')
      ? Number(map.get('--retention-days'))
      : DEFAULT_RETENTION_DAYS,
    dryRun: parseBool(map.get('--dry-run')),
    json: parseBool(map.get('--json')),
  };
}

function getRotatedPath(filePath, timestamp = Date.now()) {
  const dir = path.dirname(filePath);
  return path.join(dir, `.flight-recorder.${timestamp}.jsonl`);
}

function listRotatedFiles(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => ROTATED_SUFFIX_RE.test(name))
    .map(name => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      return {
        fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function rotateIfNeeded(filePath, maxBytes, dryRun = false) {
  if (!fs.existsSync(filePath)) return null;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return null;
  const stat = fs.statSync(filePath);
  if (stat.size < maxBytes) return null;

  const rotatedPath = getRotatedPath(filePath);
  if (!dryRun) {
    fs.renameSync(filePath, rotatedPath);
  }
  return rotatedPath;
}

function pruneRotatedFiles(filePath, maxFiles, retentionDays, dryRun = false) {
  const now = Date.now();
  const retentionMs =
    Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : 0;

  const rotated = listRotatedFiles(filePath);
  const deleted = [];

  for (const row of rotated) {
    const tooOld = retentionMs > 0 && now - row.mtimeMs > retentionMs;
    if (!tooOld) continue;
    deleted.push(row.fullPath);
    if (!dryRun) fs.unlinkSync(row.fullPath);
  }

  const afterRetention = listRotatedFiles(filePath);
  if (Number.isFinite(maxFiles) && maxFiles > 0 && afterRetention.length > maxFiles) {
    for (const row of afterRetention.slice(maxFiles)) {
      deleted.push(row.fullPath);
      if (!dryRun) fs.unlinkSync(row.fullPath);
    }
  }

  return deleted;
}

function main() {
  const opts = parseArgs(process.argv);
  const dir = path.dirname(opts.file);
  if (!fs.existsSync(dir) && !opts.dryRun) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rotatedPath = rotateIfNeeded(opts.file, opts.maxBytes, opts.dryRun);
  const deleted = pruneRotatedFiles(opts.file, opts.maxFiles, opts.retentionDays, opts.dryRun);
  const rotatedCount = rotatedPath ? 1 : 0;

  const result = {
    file: opts.file,
    dryRun: opts.dryRun,
    rotated: rotatedCount,
    rotatedPath: rotatedPath || null,
    deletedCount: deleted.length,
    deleted,
    maxBytes: opts.maxBytes,
    maxFiles: opts.maxFiles,
    retentionDays: opts.retentionDays,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write('Flight recorder maintenance\n');
    process.stdout.write(`- File: ${result.file}\n`);
    process.stdout.write(`- Dry run: ${result.dryRun}\n`);
    process.stdout.write(`- Rotated: ${result.rotated}\n`);
    process.stdout.write(`- Deleted: ${result.deletedCount}\n`);
  }
}
const wrappedMain = wrapCLITool(main, 'flight-recorder-maintenance');

if (require.main === module) {
  wrappedMain();
}
