#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATA_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'context',
  'data',
  'skill-usage'
);
const JSONL_FILENAME = 'skill-usage.jsonl';

class SkillUsageTracker {
  constructor(dataDir) {
    this._dataDir = dataDir != null ? dataDir : DEFAULT_DATA_DIR;
    this._dataFile = path.join(this._dataDir, JSONL_FILENAME);
  }

  /**
   * Append one invocation record to the JSONL file.
   * @param {string} skillName
   * @param {{ success: boolean, durationMs: number }} options
   */
  recordInvocation(skillName, { success, durationMs }) {
    fs.mkdirSync(this._dataDir, { recursive: true });
    const record = {
      skillName: String(skillName),
      success: Boolean(success),
      durationMs: Number(durationMs),
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(this._dataFile, JSON.stringify(record) + '\n', 'utf8');
  }

  /**
   * Read all records from the JSONL file.
   * @returns {Array<{skillName:string, success:boolean, durationMs:number, timestamp:string}>}
   */
  _readAllRecords() {
    if (!fs.existsSync(this._dataFile)) return [];
    const raw = fs.readFileSync(this._dataFile, 'utf8');
    if (!raw.trim()) return [];
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(entry => entry !== null && typeof entry === 'object');
  }

  /**
   * Compute aggregated stats for a single skill.
   * @param {string} skillName
   * @returns {{ invocations: number, successRate: number, avgDurationMs: number, lastUsed: string|null }}
   */
  getUsageStats(skillName) {
    const records = this._readAllRecords().filter(r => r.skillName === skillName);
    return _computeStats(skillName, records);
  }

  /**
   * Return the top n most-invoked skills sorted by invocation count descending.
   * @param {number} n
   * @returns {Array<{skillName:string, invocations:number, successRate:number, avgDurationMs:number, lastUsed:string|null}>}
   */
  getTopSkills(n) {
    const bySkill = _groupBySkill(this._readAllRecords());
    return Object.entries(bySkill)
      .map(([skillName, recs]) => _computeStats(skillName, recs))
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, n);
  }

  /**
   * Return skills whose successRate is strictly below the given threshold.
   * @param {number} threshold  value in [0, 1]
   * @returns {Array<{skillName:string, invocations:number, successRate:number, avgDurationMs:number, lastUsed:string|null}>}
   */
  getFailingSkills(threshold) {
    const bySkill = _groupBySkill(this._readAllRecords());
    return Object.entries(bySkill)
      .map(([skillName, recs]) => _computeStats(skillName, recs))
      .filter(stats => stats.successRate < threshold);
  }

  /**
   * Return a map of skillName -> stats for every tracked skill.
   * @returns {Object.<string, {invocations:number, successRate:number, avgDurationMs:number, lastUsed:string|null}>}
   */
  getAllStats() {
    const bySkill = _groupBySkill(this._readAllRecords());
    const result = {};
    for (const [skillName, recs] of Object.entries(bySkill)) {
      result[skillName] = _computeStats(skillName, recs);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _groupBySkill(records) {
  const map = {};
  for (const record of records) {
    const name = record.skillName;
    if (!map[name]) map[name] = [];
    map[name].push(record);
  }
  return map;
}

function _computeStats(skillName, records) {
  if (!records || records.length === 0) {
    return { skillName, invocations: 0, successRate: 0, avgDurationMs: 0, lastUsed: null };
  }
  const invocations = records.length;
  const successCount = records.filter(r => r.success === true).length;
  const successRate = successCount / invocations;
  const totalDuration = records.reduce((sum, r) => sum + Number(r.durationMs || 0), 0);
  const avgDurationMs = totalDuration / invocations;
  const timestamps = records.map(r => r.timestamp).filter(Boolean);
  const lastUsed = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
  return { skillName, invocations, successRate, avgDurationMs, lastUsed };
}

module.exports = { SkillUsageTracker };
