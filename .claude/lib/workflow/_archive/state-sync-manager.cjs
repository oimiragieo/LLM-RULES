/**
 * SPEC-019: State Synchronization Manager
 *
 * Manages bi-directional state synchronization between conductor-main and agent-studio.
 * Implements vector clocks for conflict detection, conflict resolution strategies,
 * and eventual consistency validation.
 */

class StateSyncManager {
  constructor(config = {}) {
    this.strategy = config.strategy || 'last-write-wins';
    this.conflictStrategy = this.strategy; // Alias for backwards compatibility
    this.syncHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000; // Prevent memory leak
    this.vectorClocks = new Map(); // taskId → { system1: clock, system2: clock }
    this.primarySystem = config.primarySystem || 'agent-studio';
    this.syncInterval = config.syncInterval || 1000;
    this.backgroundSyncInterval = null;

    // System state stores
    this.systems = {
      'conductor-main': new Map(),
      'agent-studio': new Map(),
    };

    // Status mappings
    this.statusMapping = {
      // agent-studio → conductor-main
      in_progress: 'running',
      completed: 'success',
      failed: 'failed',
      pending: 'pending',
    };

    this.reverseStatusMapping = {
      // conductor-main → agent-studio
      running: 'in_progress',
      success: 'completed',
      failed: 'failed',
      pending: 'pending',
    };
  }

  /**
   * Push state to a specific system
   */
  async pushToSystem(systemName, state) {
    if (!this.systems[systemName]) {
      throw new Error(`Unknown system: ${systemName}`);
    }

    // Translate status if needed
    const translatedState = this._translateStatus(state, systemName);
    this.systems[systemName].set(state.taskId, translatedState);

    return translatedState;
  }

  /**
   * Get state from a specific system
   */
  async getFromSystem(systemName, taskId) {
    if (!this.systems[systemName]) {
      throw new Error(`Unknown system: ${systemName}`);
    }

    return this.systems[systemName].get(taskId) || null;
  }

  /**
   * Translate status between systems
   */
  _translateStatus(state, targetSystem) {
    const translated = { ...state };

    if (targetSystem === 'conductor-main' && state.status) {
      translated.status = this.statusMapping[state.status] || state.status;
    } else if (targetSystem === 'agent-studio' && state.status) {
      translated.status = this.reverseStatusMapping[state.status] || state.status;
    }

    return translated;
  }

  /**
   * Detect conflict between two states using vector clocks
   */
  detectConflict(stateA, stateB) {
    const clockA = stateA.vectorClock || 0;
    const clockB = stateB.vectorClock || 0;

    // Concurrent update if vector clocks are equal but states differ
    if (clockA === clockB && stateA.status !== stateB.status) {
      return {
        type: 'concurrent_update',
        conflicted: true,
        stateA,
        stateB,
        clocks: { clockA, clockB },
      };
    }

    return {
      type: 'no_conflict',
      conflicted: false,
    };
  }

  /**
   * Resolve conflict between two states
   */
  resolve(olderState, newerState) {
    // Determine winner based on vector clock or timestamp
    const clockA = olderState.vectorClock || 0;
    const clockB = newerState.vectorClock || 0;

    if (clockB > clockA) {
      return newerState;
    } else if (clockA > clockB) {
      return olderState;
    }

    // Equal clocks - use timestamp (last-write-wins)
    if (this.strategy === 'last-write-wins') {
      const tsA = new Date(olderState.updatedAt || olderState.timestamp || 0).getTime();
      const tsB = new Date(newerState.updatedAt || newerState.timestamp || 0).getTime();
      return tsB >= tsA ? newerState : olderState;
    }

    // Default to newer state
    return newerState;
  }

  /**
   * Merge two states with conflict detection
   */
  merge(stateA, stateB) {
    const clockA = stateA.vectorClock || 0;
    const clockB = stateB.vectorClock || 0;

    // If clocks differ, use vector clock comparison
    if (clockA !== clockB) {
      return clockA > clockB ? stateA : stateB;
    }

    // Equal clocks = concurrent update (conflict)
    if (this.strategy === 'manual') {
      return {
        ...stateA,
        _conflict: {
          local: stateA.status,
          remote: stateB.status,
          stateA,
          stateB,
        },
      };
    }

    if (this.strategy === 'field-merge') {
      // Merge non-conflicting fields
      const merged = { ...stateA };
      const conflicts = [];

      for (const [key, value] of Object.entries(stateB)) {
        if (key === 'vectorClock' || key === 'taskId') continue;

        if (key === 'metadata') {
          // Deep merge metadata
          merged.metadata = { ...(stateA.metadata || {}), ...(stateB.metadata || {}) };
        } else if (key === 'status' && stateA.status !== value) {
          // Status conflict - take newer (stateB) for status
          merged.status = value;
        } else if (key === 'progress' && stateA.progress !== value) {
          // Progress - take higher value
          merged.progress = Math.max(stateA.progress || 0, value || 0);
        } else if (stateA[key] !== value && stateA[key] !== undefined) {
          conflicts.push({ field: key, valueA: stateA[key], valueB: value });
        } else {
          merged[key] = value;
        }
      }

      if (conflicts.length > 0) {
        merged._fieldConflicts = conflicts;
      }

      return merged;
    }

    // Default: last-write-wins with conflict marker
    const tsA = new Date(stateA.updatedAt || 0).getTime();
    const tsB = new Date(stateB.updatedAt || 0).getTime();
    const winner = tsB >= tsA ? stateB : stateA;

    return {
      ...winner,
      metadata: { ...(stateA.metadata || {}), ...(stateB.metadata || {}) },
      _conflict: {
        type: 'concurrent_update',
        resolved: 'last-write-wins',
      },
    };
  }

  /**
   * Sync a single task between systems
   */
  async sync(taskId, state) {
    if (state) {
      // Push to both systems
      await this.pushToSystem('agent-studio', state);
      await this.pushToSystem('conductor-main', state);
    }

    // Get current states
    const agentState = await this.getFromSystem('agent-studio', taskId);
    const conductorState = await this.getFromSystem('conductor-main', taskId);

    if (!agentState && !conductorState) {
      return { synced: false, reason: 'no_state_found' };
    }

    // If only one system has state, sync to the other
    if (agentState && !conductorState) {
      await this.pushToSystem('conductor-main', agentState);
      return { synced: true, direction: 'agent-studio → conductor-main' };
    }

    if (conductorState && !agentState) {
      await this.pushToSystem('agent-studio', conductorState);
      return { synced: true, direction: 'conductor-main → agent-studio' };
    }

    // Both have state - resolve conflicts
    const resolved = this.resolve(conductorState, agentState);
    await this.pushToSystem('agent-studio', resolved);
    await this.pushToSystem('conductor-main', resolved);

    this.syncHistory.push({
      taskId,
      timestamp: Date.now(),
      synced: true,
    });

    // Trim history to prevent memory leak
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory = this.syncHistory.slice(-this.maxHistorySize);
    }

    return { synced: true, resolved };
  }

  /**
   * Batch sync multiple tasks
   */
  async batchSync(tasks) {
    const results = [];
    for (const task of tasks) {
      const result = await this.sync(task.taskId, task);
      results.push(result);
    }
    return results;
  }

  /**
   * Find orphaned tasks (exist in one system but not the other)
   */
  async findOrphans(systemName) {
    const otherSystem = systemName === 'conductor-main' ? 'agent-studio' : 'conductor-main';

    const systemTasks = Array.from(this.systems[systemName].values());
    const otherTasks = new Set(
      Array.from(this.systems[otherSystem].keys()).map(
        k => this.systems[otherSystem].get(k)?.taskId
      )
    );

    return systemTasks.filter(task => !otherTasks.has(task.taskId));
  }

  /**
   * Reconcile orphaned tasks to primary system
   */
  async reconcileOrphans() {
    const conductorOrphans = await this.findOrphans('conductor-main');
    const agentOrphans = await this.findOrphans('agent-studio');

    for (const orphan of conductorOrphans) {
      await this.pushToSystem('agent-studio', orphan);
    }

    for (const orphan of agentOrphans) {
      await this.pushToSystem('conductor-main', orphan);
    }

    this.syncHistory.push({
      timestamp: Date.now(),
      operation: 'orphan_reconciliation',
      conductorOrphans: conductorOrphans.length,
      agentOrphans: agentOrphans.length,
    });

    // Trim history to prevent memory leak
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory = this.syncHistory.slice(-this.maxHistorySize);
    }

    return {
      reconciled: conductorOrphans.length + agentOrphans.length,
      conductorOrphans,
      agentOrphans,
    };
  }

  /**
   * Start background synchronization
   */
  startBackgroundSync() {
    if (this.backgroundSyncInterval) return;

    this.backgroundSyncInterval = setInterval(async () => {
      // Get all task IDs from both systems
      const allTaskIds = new Set([
        ...Array.from(this.systems['agent-studio'].keys()),
        ...Array.from(this.systems['conductor-main'].keys()),
      ]);

      for (const taskId of allTaskIds) {
        await this.sync(taskId);
      }
    }, this.syncInterval);
  }

  /**
   * Stop background synchronization
   */
  stopBackgroundSync() {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }
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

      // Trim history to prevent memory leak
      if (this.syncHistory.length > this.maxHistorySize) {
        this.syncHistory = this.syncHistory.slice(-this.maxHistorySize);
      }

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

    // Trim history to prevent memory leak
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory = this.syncHistory.slice(-this.maxHistorySize);
    }

    return {
      conflicts: [],
      resolved: merged,
      metadata: {
        vectorClocks: this.vectorClocks.get(taskId),
      },
    };
  }

  /**
   * Detect concurrent updates using vector clocks (internal)
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
   * Resolve conflict using configured strategy (internal)
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
   * Merge states when no conflict exists (internal)
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
   * Detect orphaned tasks (exist in one system but not the other) - legacy API
   */
  detectOrphanedTasks(system1Tasks, system2Tasks) {
    const ids1 = new Set(system1Tasks.map(t => t.taskId));
    const ids2 = new Set(system2Tasks.map(t => t.taskId));

    const orphansInSystem1 = system1Tasks.filter(t => !ids2.has(t.taskId));
    const orphansInSystem2 = system2Tasks.filter(t => !ids1.has(t.taskId));

    return {
      system1Orphans: orphansInSystem1,
      system2Orphans: orphansInSystem2,
      count: orphansInSystem1.length + orphansInSystem2.length,
    };
  }

  /**
   * Get synchronization metrics
   */
  getMetrics() {
    const totalSyncs = this.syncHistory.length;
    const conflicts = this.syncHistory.filter(s => s.conflict).length;

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
