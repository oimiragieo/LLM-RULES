/**
 * SPEC-019: State Synchronization Manager
 *
 * Manages bi-directional state synchronization between conductor-main and agent-studio.
 * Implements vector clocks for conflict detection, conflict resolution strategies,
 * and eventual consistency validation.
 */

class StateSyncManager {
  constructor(config = {}) {
    this.conflictStrategy = config.conflictStrategy || 'last-write-wins';
    this.syncHistory = [];
    this.vectorClocks = new Map(); // taskId → { system1: clock, system2: clock }
  }

  /**
   * Synchronize state bi-directionally between systems
   * @param {Object} state1 - State from system 1
   * @param {Object} state2 - State from system 2
   * @returns {Promise<Object>} Sync result { conflicts, resolved, metadata }
   */
  async syncBidirectional(state1, state2) {
    const taskId = state1.taskId || state2.taskId;

    // Initialize vector clocks if not present
    if (!this.vectorClocks.has(taskId)) {
      this.vectorClocks.set(taskId, {
        system1: state1.vectorClock || 0,
        system2: state2.vectorClock || 0,
      });
    }

    // Detect conflicts using vector clocks
    const conflict = this._detectConflict(state1, state2);

    if (conflict) {
      // Resolve conflict using configured strategy
      const resolved = this._resolveConflict(state1, state2);

      // Record sync history
      this.syncHistory.push({
        taskId,
        timestamp: Date.now(),
        conflict: true,
        strategy: this.conflictStrategy,
        resolved,
      });

      return {
        conflicts: [conflict],
        resolved,
        metadata: {
          strategy: this.conflictStrategy,
          vectorClocks: this.vectorClocks.get(taskId),
        },
      };
    }

    // No conflict - merge states
    const merged = this._mergeStates(state1, state2);

    this.syncHistory.push({
      taskId,
      timestamp: Date.now(),
      conflict: false,
      merged,
    });

    return {
      conflicts: [],
      resolved: merged,
      metadata: {
        vectorClocks: this.vectorClocks.get(taskId),
      },
    };
  }

  /**
   * Detect concurrent updates using vector clocks
   */
  _detectConflict(state1, state2) {
    const clock1 = state1.vectorClock || 0;
    const clock2 = state2.vectorClock || 0;

    // Concurrent update if vector clocks are equal
    if (clock1 === clock2 && state1.updatedAt !== state2.updatedAt) {
      return {
        type: 'concurrent_update',
        state1,
        state2,
        clocks: { clock1, clock2 },
      };
    }

    return null;
  }

  /**
   * Resolve conflict using configured strategy
   */
  _resolveConflict(state1, state2) {
    if (this.conflictStrategy === 'last-write-wins') {
      // Use timestamp to determine winner
      const ts1 = new Date(state1.updatedAt || state1.timestamp).getTime();
      const ts2 = new Date(state2.updatedAt || state2.timestamp).getTime();
      return ts1 > ts2 ? state1 : state2;
    }

    if (this.conflictStrategy === 'manual') {
      // Mark for manual resolution
      return {
        ...state1,
        conflictMarker: 'MANUAL_RESOLUTION_REQUIRED',
        conflictingStates: [state1, state2],
      };
    }

    if (this.conflictStrategy === 'field-merge') {
      // Merge non-conflicting fields
      const merged = { ...state1 };
      const conflicts = [];

      for (const [key, value] of Object.entries(state2)) {
        if (state1[key] !== value && state1[key] !== undefined) {
          conflicts.push({ field: key, value1: state1[key], value2: value });
        } else {
          merged[key] = value;
        }
      }

      if (conflicts.length > 0) {
        merged.fieldConflicts = conflicts;
      }

      return merged;
    }

    // Default: last-write-wins
    return state1;
  }

  /**
   * Merge states when no conflict exists
   */
  _mergeStates(state1, state2) {
    // Newer state wins based on vector clock
    const clock1 = state1.vectorClock || 0;
    const clock2 = state2.vectorClock || 0;

    if (clock1 > clock2) return state1;
    if (clock2 > clock1) return state2;

    // Clocks equal - use timestamp
    const ts1 = new Date(state1.updatedAt || state1.timestamp).getTime();
    const ts2 = new Date(state2.updatedAt || state2.timestamp).getTime();

    return ts1 > ts2 ? state1 : state2;
  }

  /**
   * Validate eventual consistency
   * @param {Object} state1 - State from system 1
   * @param {Object} state2 - State from system 2
   * @param {number} timeLimit - Time limit for convergence (ms)
   * @returns {Promise<boolean>} True if states converged within time limit
   */
  async validateEventualConsistency(state1, state2, timeLimit) {
    const startTime = Date.now();

    // Sync states
    const syncResult = await this.syncBidirectional(state1, state2);

    // Check convergence time
    const elapsed = Date.now() - startTime;

    return {
      converged: syncResult.conflicts.length === 0,
      elapsed,
      withinLimit: elapsed < timeLimit,
      resolved: syncResult.resolved,
    };
  }

  /**
   * Detect orphaned tasks (exist in one system but not the other)
   */
  detectOrphanedTasks(system1Tasks, system2Tasks) {
    const ids1 = new Set(system1Tasks.map((t) => t.taskId));
    const ids2 = new Set(system2Tasks.map((t) => t.taskId));

    const orphansInSystem1 = system1Tasks.filter((t) => !ids2.has(t.taskId));
    const orphansInSystem2 = system2Tasks.filter((t) => !ids1.has(t.taskId));

    return {
      system1Orphans: orphansInSystem1,
      system2Orphans: orphansInSystem2,
      count: orphansInSystem1.length + orphansInSystem2.length,
    };
  }

  /**
   * Reconcile orphaned tasks
   */
  reconcileOrphans(orphans, targetSystem) {
    const reconciled = orphans.map((task) => ({
      ...task,
      reconciledAt: new Date().toISOString(),
      reconciledTo: targetSystem,
    }));

    this.syncHistory.push({
      timestamp: Date.now(),
      operation: 'orphan_reconciliation',
      count: orphans.length,
      targetSystem,
    });

    return reconciled;
  }

  /**
   * Get synchronization metrics
   */
  getMetrics() {
    const totalSyncs = this.syncHistory.length;
    const conflicts = this.syncHistory.filter((s) => s.conflict).length;

    return {
      totalSyncs,
      conflicts,
      conflictRate: totalSyncs > 0 ? (conflicts / totalSyncs) * 100 : 0,
      trackedTasks: this.vectorClocks.size,
    };
  }

  /**
   * Clear sync history
   */
  clearHistory() {
    this.syncHistory = [];
  }
}

module.exports = StateSyncManager;
