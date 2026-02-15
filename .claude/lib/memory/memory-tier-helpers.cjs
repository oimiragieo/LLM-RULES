'use strict';

const fs = require('fs');
const path = require('path');

const MEMORY_TIER_EVENTS_FILE = path.join(
  '.claude',
  'context',
  'runtime',
  'memory-tier-events.jsonl'
);
const MEMORY_TIER_EVENTS_MAX_BYTES = Number(process.env.MEMORY_TIER_EVENTS_MAX_BYTES || 1048576);
let uniqueFileCounter = 0;

function isStructuredSummaryEnabled() {
  const value = String(process.env.MEMORY_STRUCTURED_SUMMARY || '').toLowerCase();
  return value === '1' || value === 'true';
}

function isSessionArchiveEnabled() {
  const value = String(process.env.MEMORY_SESSION_ARCHIVE || '').toLowerCase();
  return value === '1' || value === 'true';
}

function extractAbstractFromSummary(summaryText) {
  const lines = String(summaryText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  const overviewIndex = lines.findIndex(line =>
    line.toLowerCase().includes('one-sentence overview')
  );
  if (overviewIndex !== -1) {
    const nextLine = lines.slice(overviewIndex + 1).find(line => !line.startsWith('#'));
    if (nextLine) return nextLine;
  }
  return lines[0];
}

function getNextArchiveDir(mtmDir, ensureDir) {
  ensureDir(mtmDir);
  const entries = fs.readdirSync(mtmDir, { withFileTypes: true });
  const existing = entries
    .filter(ent => ent.isDirectory() && /^archive_\d+$/.test(ent.name))
    .map(ent => Number(ent.name.replace('archive_', '')))
    .filter(Number.isFinite);
  const nextIndex = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  const dirName = `archive_${String(nextIndex).padStart(3, '0')}`;
  return path.join(mtmDir, dirName);
}

function writeSessionArchive(mtmData, mtmPath, projectRoot, deps) {
  const { getTierPath, ensureDir, atomicWriteSync } = deps;
  const mtmDir = getTierPath('MTM', projectRoot);
  const archiveDir = getNextArchiveDir(mtmDir, ensureDir);
  ensureDir(archiveDir);

  const sessionPath = path.join(archiveDir, 'session.json');
  atomicWriteSync(sessionPath, JSON.stringify(mtmData, null, 2));

  const summaryPath = mtmPath.replace(/\.json$/i, '.summary.md');
  let overview = '';
  if (fs.existsSync(summaryPath)) {
    try {
      overview = fs.readFileSync(summaryPath, 'utf8').trim();
    } catch (_e) {
      overview = '';
    }
  }
  if (!overview && mtmData.summary) {
    overview = String(mtmData.summary).trim();
  }
  if (!overview) {
    overview = '_No summary available._';
  }

  const overviewPath = path.join(archiveDir, '.overview.md');
  atomicWriteSync(overviewPath, overview);

  const abstract = extractAbstractFromSummary(overview);
  const abstractPath = path.join(archiveDir, '.abstract.md');
  atomicWriteSync(abstractPath, abstract || '_No summary available._');

  return { archiveDir, overviewPath, abstractPath, sessionPath };
}

function buildUniqueTimestampToken() {
  uniqueFileCounter = (uniqueFileCounter + 1) % 1000000;
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${String(
    uniqueFileCounter
  ).padStart(6, '0')}`;
}

function shouldWriteTierEvents() {
  return String(process.env.MEMORY_TIER_EVENT_LOG || 'on').toLowerCase() !== 'off';
}

function appendTierEvent(eventType, details = {}, projectRoot, ensureDir) {
  if (!shouldWriteTierEvents()) return;
  try {
    const eventsPath = path.join(projectRoot, MEMORY_TIER_EVENTS_FILE);
    const eventsDir = path.dirname(eventsPath);
    ensureDir(eventsDir);

    if (fs.existsSync(eventsPath)) {
      const stats = fs.statSync(eventsPath);
      if (stats.size >= MEMORY_TIER_EVENTS_MAX_BYTES) {
        const rotated = eventsPath.replace(
          /\.jsonl$/i,
          `.${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
        );
        fs.renameSync(eventsPath, rotated);
      }
    }

    const payload = {
      ts: new Date().toISOString(),
      event: eventType,
      ...details,
    };
    fs.appendFileSync(eventsPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (_e) {
    // Best-effort observability only; never block memory operations.
  }
}

module.exports = {
  isStructuredSummaryEnabled,
  isSessionArchiveEnabled,
  writeSessionArchive,
  buildUniqueTimestampToken,
  appendTierEvent,
};
