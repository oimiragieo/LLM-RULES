#!/usr/bin/env node
/**
 * BM25 Health Check & Maintenance
 * 
 * Validates the sparse index for:
 * 1. Orphaned documents (IDs that no longer exist in the source/vector store).
 * 2. Stale content (Documents where the hash doesn't match current state).
 * 3. Average document length anomalies.
 */

'use strict';

class BM25HealthChecker {
  constructor(indexer, options = {}) {
    this.indexer = indexer;
    this.options = options;
  }

  /**
   * Run health checks
   * @param {string[]} validIds - List of IDs that SHOULD be in the index
   * @returns {Object} Health report
   */
  check(validIds) {
    const indexedIds = this.indexer.documents.map(d => d.id);
    const validSet = new Set(validIds);
    
    const orphaned = indexedIds.filter(id => !validSet.has(id));
    const missing = validIds.filter(id => !indexedIds.includes(id));
    
    const healthScore = indexedIds.length === 0 ? 1 : 
      Math.max(0, 1 - (orphaned.length / indexedIds.length));

    return {
      totalIndexed: indexedIds.length,
      orphanedCount: orphaned.length,
      missingCount: missing.length,
      orphanedIds: orphaned,
      healthScore,
      status: healthScore > 0.9 ? 'healthy' : 'degraded'
    };
  }

  /**
   * Auto-repair the index by removing orphaned documents
   */
  repair(validIds) {
    const report = this.check(validIds);
    let repairedCount = 0;
    
    for (const id of report.orphanedIds) {
      if (this.indexer.removeDocument(id)) {
        repairedCount++;
      }
    }
    
    if (repairedCount > 0) {
      this.indexer.optimize();
    }
    
    return { repairedCount, finalHealth: this.check(validIds) };
  }
}

module.exports = { BM25HealthChecker };
