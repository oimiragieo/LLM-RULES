/**
 * Workflow Cache - LRU cache for workflow metadata
 *
 * Features:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Cache hit/miss tracking
 * - Pattern-based invalidation
 * - Cache stampede prevention (locking)
 * - Cache warming
 *
 * @module workflow-cache
 */

const EventEmitter = require('events');

class WorkflowCache extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || null; // milliseconds, null = no expiration
    this.cache = new Map(); // key -> { value, timestamp, accessCount }
    this.accessOrder = []; // LRU queue (most recent at end)
    this.stats = {
      hits: 0,
      misses: 0,
    };
    this.locks = new Map(); // key -> Promise (for preventing stampede)
  }

  /**
   * Set cache entry
   */
  set(key, value) {
    // Evict LRU if at max size
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this._evictLRU();
    }

    // Remove from accessOrder if exists
    this._removeFromAccessOrder(key);

    // Add to cache
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 1,
    });

    // Add to end of access order (most recent)
    this.accessOrder.push(key);
  }

  /**
   * Get cache entry
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this._removeFromAccessOrder(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access
    this.stats.hits++;
    entry.accessCount++;

    // Move to end of access order (most recent)
    this._removeFromAccessOrder(key);
    this.accessOrder.push(key);

    return entry.value;
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    // Check TTL
    const entry = this.cache.get(key);
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this._removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate single entry
   */
  invalidate(key) {
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.invalidate(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Get or compute value (prevents cache stampede)
   */
  async getOrCompute(key, computeFn) {
    // Check cache first
    if (this.has(key)) {
      return this.get(key);
    }

    // Check if already computing
    if (this.locks.has(key)) {
      // Wait for existing computation
      return await this.locks.get(key);
    }

    // Start new computation
    const computePromise = (async () => {
      try {
        const value = await computeFn(key);
        this.set(key, value);
        return value;
      } finally {
        this.locks.delete(key);
      }
    })();

    this.locks.set(key, computePromise);
    return await computePromise;
  }

  /**
   * Warm cache with workflows
   */
  warm(workflows) {
    for (const workflow of workflows) {
      this.set(workflow.name, workflow);
    }
  }

  /**
   * Remove from access order array
   */
  _removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0]; // First element is LRU
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }
}

module.exports = WorkflowCache;
