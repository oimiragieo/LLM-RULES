'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function parseInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function getStorePaths(runtimeDir) {
  return {
    listPath: path.join(runtimeDir, 'session-handoffs.json'),
  };
}

function loadEntries(listPath) {
  try {
    if (!fs.existsSync(listPath)) return [];
    const parsed = safeParseJSON(fs.readFileSync(listPath, 'utf8'), []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function saveEntries(listPath, entries) {
  fs.mkdirSync(path.dirname(listPath), { recursive: true });
  fs.writeFileSync(listPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

function main() {
  const input = parseInput();
  const runtimeDir = input.runtimeDir || path.join(process.cwd(), '.claude', 'context', 'runtime');
  const { listPath } = getStorePaths(runtimeDir);
  const operation = String(input.operation || 'list').toLowerCase();
  const entries = loadEntries(listPath);

  if (operation === 'create') {
    const summary = String(input.summary || '').trim();
    if (!summary) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'summary is required' }) + '\n');
      return;
    }
    const entry = {
      id: `handoff-${Date.now()}`,
      fromSession: input.fromSession || null,
      toSession: input.toSession || null,
      summary,
      filesModified: Array.isArray(input.filesModified) ? input.filesModified : [],
      acknowledged: false,
      createdAt: new Date().toISOString(),
    };
    entries.push(entry);
    saveEntries(listPath, entries);
    process.stdout.write(JSON.stringify({ ok: true, created: entry }) + '\n');
    return;
  }

  if (operation === 'ack') {
    const id = String(input.id || '').trim();
    if (!id) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'id is required for ack' }) + '\n');
      return;
    }
    const entry = entries.find(item => item.id === id);
    if (!entry) {
      process.stdout.write(JSON.stringify({ ok: false, error: `handoff not found: ${id}` }) + '\n');
      return;
    }
    entry.acknowledged = true;
    entry.acknowledgedAt = new Date().toISOString();
    saveEntries(listPath, entries);
    process.stdout.write(JSON.stringify({ ok: true, acknowledged: entry }) + '\n');
    return;
  }

  if (operation === 'get') {
    const id = String(input.id || '').trim();
    const entry = entries.find(item => item.id === id) || null;
    process.stdout.write(JSON.stringify({ ok: true, entry }) + '\n');
    return;
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      handoffs: entries.slice(-20),
      count: entries.length,
    }) + '\n'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  }
}

module.exports = { main };
