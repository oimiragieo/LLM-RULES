'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { withFileLock } = require('../memory/memory-tiers-lock.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const DELEGATIONS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'memory',
  'delegations.json'
);

class DelegationStore {
  constructor(filePath = DELEGATIONS_FILE) {
    this.filePath = filePath;
    this.ensureDir();
  }

  ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async load() {
    return withFileLock(() => {
      if (!fs.existsSync(this.filePath)) return {};
      try {
        const content = fs.readFileSync(this.filePath, 'utf8');
        return safeParseJSON(content) || {};
      } catch (err) {
        console.error(`[DelegationStore] Failed to load delegations: ${err.message}`);
        return {};
      }
    });
  }

  async save(delegations) {
    return withFileLock(() => {
      atomicWriteSync(this.filePath, JSON.stringify(delegations, null, 2));
      return true;
    });
  }

  async updateRecord(taskId, record) {
    return withFileLock(() => {
      const delegations = this._loadSync();
      delegations[taskId] = record;
      atomicWriteSync(this.filePath, JSON.stringify(delegations, null, 2));
      return true;
    });
  }

  // Internal sync load for use within lock
  _loadSync() {
    if (!fs.existsSync(this.filePath)) return {};
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return safeParseJSON(content) || {};
    } catch (_err) {
      return {};
    }
  }
}

module.exports = DelegationStore;
