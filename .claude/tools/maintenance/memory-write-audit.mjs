#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function getMemoryFiles(projectRoot) {
  const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
  return [path.join(memoryDir, 'gotchas.json'), path.join(memoryDir, 'patterns.json')];
}

function readArrayJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArrayJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function auditMemoryWriteSources(projectRoot = DEFAULT_PROJECT_ROOT) {
  const files = getMemoryFiles(projectRoot);
  const violations = [];

  for (const filePath of files) {
    const entries = readArrayJson(filePath);
    entries.forEach((entry, index) => {
      const source = entry?.writeSource;
      if (source === 'direct_write' || typeof source !== 'string' || source.trim() === '') {
        violations.push({
          file: filePath,
          index,
          writeSource: source,
          reason: source === 'direct_write' ? 'direct_write_forbidden' : 'missing_write_source',
        });
      }
    });
  }

  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

export function migrateMemoryWriteSources(
  projectRoot = DEFAULT_PROJECT_ROOT,
  options = { apply: false, source: 'memory_api' }
) {
  const apply = options?.apply === true;
  const source = options?.source || 'memory_api';
  const files = getMemoryFiles(projectRoot);
  let updatedEntries = 0;

  for (const filePath of files) {
    const entries = readArrayJson(filePath);
    if (entries.length === 0) continue;
    let changed = false;
    const next = entries.map(entry => {
      if (!entry || typeof entry !== 'object') return entry;
      const writeSource = entry.writeSource;
      if (typeof writeSource === 'string' && writeSource.trim() !== '') return entry;
      changed = true;
      updatedEntries += 1;
      return { ...entry, writeSource: source };
    });
    if (apply && changed) {
      writeArrayJson(filePath, next);
    }
  }

  return {
    ok: true,
    apply,
    updatedEntries,
  };
}

function parseArgs(argv) {
  const args = {
    projectRoot: DEFAULT_PROJECT_ROOT,
    apply: false,
    source: 'memory_api',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project-root' && argv[i + 1]) {
      args.projectRoot = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

if (import.meta.url === `file://${__filename}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply) {
    const migration = migrateMemoryWriteSources(args.projectRoot, {
      apply: true,
      source: args.source,
    });
    console.log(JSON.stringify({ migration }, null, 2));
  }
  const audit = auditMemoryWriteSources(args.projectRoot);
  console.log(JSON.stringify({ audit }, null, 2));
  process.exit(audit.ok ? 0 : 1);
}
