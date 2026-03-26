'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const QUEUE_RELATIVE_PATH = path.join('.claude', 'context', 'runtime', 'evolution-requests.jsonl');

/**
 * Read existing entries from the evolution-requests JSONL queue.
 *
 * @param {string} queuePath - Absolute path to the JSONL file
 * @returns {Array<Object>}
 */
function readExistingEntries(queuePath) {
  if (!fs.existsSync(queuePath)) return [];

  const raw = fs.readFileSync(queuePath, 'utf8');
  if (!raw.trim()) return [];

  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return safeParseJSON(line);
      } catch {
        return null;
      }
    })
    .filter(entry => entry && typeof entry === 'object');
}

/**
 * Check if an agent already has a pending skill_cascade entry.
 *
 * @param {Array<Object>} existing - Current queue entries
 * @param {string} agentName - Agent to check
 * @returns {boolean}
 */
function hasPendingCascade(existing, agentName) {
  return existing.some(
    e =>
      e.trigger === 'skill_cascade' &&
      e.status === 'proposed' &&
      e.targetArtifact &&
      e.targetArtifact.name === agentName
  );
}

/**
 * Write cascade entries to the evolution-requests queue for affected agents.
 *
 * @param {Array<{ agent: string, skill: string, reason: string }>} cascades
 * @param {string} projectRoot - Absolute path to the project root
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Return entries without writing
 * @returns {{ written: number, skipped: number, entries: Object[] }}
 */
function writeCascadeEntries(cascades, projectRoot, options = {}) {
  const { dryRun = false } = options;
  const queuePath = path.join(projectRoot, QUEUE_RELATIVE_PATH);

  const existing = readExistingEntries(queuePath);
  const entries = [];
  let skipped = 0;

  for (const cascade of cascades) {
    if (hasPendingCascade(existing, cascade.agent)) {
      skipped++;
      continue;
    }

    entries.push({
      id: `cascade_${cascade.agent}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'other',
      trigger: 'skill_cascade',
      evidence: `Skill "${cascade.skill}" updated. ${cascade.reason}`,
      suggestedArtifactType: 'agent',
      summary: `Cascade: update agent "${cascade.agent}" after "${cascade.skill}" refresh`,
      status: 'proposed',
      targetArtifact: { type: 'agent', name: cascade.agent },
    });
  }

  if (!dryRun && entries.length > 0) {
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.appendFileSync(queuePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }

  return { written: entries.length, skipped, entries };
}

module.exports = { writeCascadeEntries, readExistingEntries, hasPendingCascade };
