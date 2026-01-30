/**
 * Memory Budgeter - Enforce per-workflow memory limits
 *
 * Features:
 * - Per-workflow memory allocation tracking
 * - Budget enforcement
 * - OOM prevention
 * - Dynamic budget adjustment
 * - Warning thresholds
 * - Memory reservation for critical workflows
 *
 * @module memory-budgeter
 */

const EventEmitter = require('events');

class MemoryBudgeter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxMemory = options.maxMemory || 1024 * 1024 * 1024; // 1GB default
    this.warnThreshold = options.warnThreshold || 0.8; // Warn at 80%
    this.allocations = new Map(); // workflow name -> allocated bytes
    this.reserved = 0; // Reserved memory for critical workflows
  }

  /**
   * Allocate memory for workflow
   */
  allocate(workflowName, workflow) {
    const estimatedMemory = this._calculateEstimatedMemory(workflow);

    const totalAllocated = this.getTotalAllocated();
    const available = this.maxMemory - totalAllocated - this.reserved;

    if (estimatedMemory > available) {
      throw new Error(
        `Memory budget exceeded: workflow requires ${this._formatBytes(estimatedMemory)}, ` +
          `but only ${this._formatBytes(available)} available (total budget: ${this._formatBytes(this.maxMemory)})`
      );
    }

    this.allocations.set(workflowName, estimatedMemory);

    // Check warning threshold
    const newTotal = totalAllocated + estimatedMemory;
    const utilization = newTotal / this.maxMemory;

    if (utilization >= this.warnThreshold) {
      this.emit('warning', {
        message: `Memory usage at ${(utilization * 100).toFixed(1)}%`,
        allocated: newTotal,
        budget: this.maxMemory,
        utilization,
      });
    }
  }

  /**
   * Release memory for workflow
   */
  release(workflowName) {
    this.allocations.delete(workflowName);
  }

  /**
   * Get allocated memory for workflow
   */
  getAllocated(workflowName) {
    return this.allocations.get(workflowName) || 0;
  }

  /**
   * Get total allocated memory across all workflows
   */
  getTotalAllocated() {
    return Array.from(this.allocations.values()).reduce((sum, mem) => sum + mem, 0);
  }

  /**
   * Set maximum memory budget
   */
  setMaxMemory(bytes) {
    this.maxMemory = bytes;
  }

  /**
   * Reserve memory for critical workflows
   */
  reserve(name, bytes) {
    this.reserved += bytes;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const totalAllocated = this.getTotalAllocated();
    return {
      totalAllocated,
      totalBudget: this.maxMemory,
      reserved: this.reserved,
      availableMemory: this.maxMemory - totalAllocated - this.reserved,
      utilizationPercentage: (totalAllocated / this.maxMemory) * 100,
    };
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.allocations.keys());
  }

  /**
   * Calculate estimated memory for workflow
   */
  _calculateEstimatedMemory(workflow) {
    if (!workflow.phases) return 0;

    return workflow.phases.reduce((total, phase) => {
      return total + (phase.estimatedMemory || 0);
    }, 0);
  }

  /**
   * Format bytes for human-readable output
   */
  _formatBytes(bytes) {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)}MB`;
  }
}

module.exports = MemoryBudgeter;
