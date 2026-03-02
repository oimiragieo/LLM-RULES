/**
 * Memory retention & cold storage config (env-driven)
 * ===================================================
 *
 * Centralizes tunables used by the LTM cold-archiver and scheduler.
 *
 * Env vars:
 * - MEMORY_LTM_MAX_SUMMARIES (default: 50)
 * - MEMORY_COLD_ENABLE (default: true)
 * - MEMORY_COLD_ARCHIVE_AFTER_DAYS (optional)
 * - MEMORY_COLD_DIR (default: .claude/context/memory/cold)
 */

'use strict';

const path = require('path');

const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  return fallback;
}

function resolveColdDir(projectRoot = PROJECT_ROOT) {
  const configured = process.env.MEMORY_COLD_DIR || '.claude/context/memory/cold';
  const abs = path.resolve(projectRoot, configured);

  const validation = validatePathWithinProject(abs, projectRoot);
  if (!validation.safe) {
    throw new Error(`Invalid MEMORY_COLD_DIR: ${validation.reason}`);
  }

  return abs;
}

function getRetentionOptions(projectRoot = PROJECT_ROOT) {
  const maxSummaries = toInt(process.env.MEMORY_LTM_MAX_SUMMARIES, 50);
  const coldEnable = parseBoolEnv(process.env.MEMORY_COLD_ENABLE, true);
  const archiveAfterDays =
    process.env.MEMORY_COLD_ARCHIVE_AFTER_DAYS !== undefined &&
    process.env.MEMORY_COLD_ARCHIVE_AFTER_DAYS !== null &&
    String(process.env.MEMORY_COLD_ARCHIVE_AFTER_DAYS).trim() !== ''
      ? toInt(process.env.MEMORY_COLD_ARCHIVE_AFTER_DAYS, undefined)
      : undefined;

  return {
    maxSummaries,
    coldEnable,
    archiveAfterDays,
    coldDir: resolveColdDir(projectRoot),
  };
}

module.exports = {
  getRetentionOptions,
  resolveColdDir,
};
