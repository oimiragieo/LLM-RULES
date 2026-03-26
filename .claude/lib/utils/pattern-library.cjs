/**
 * Phase 5: Pattern Library
 *
 * Manages reusable workflow patterns:
 * - Pattern storage (in-memory + persistent)
 * - Metadata management
 * - Library statistics and analytics
 * - Reusability scoring
 * - Export/import capabilities
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('./safe-json.cjs');

class PatternLibrary {
  constructor(config = {}) {
    this.config = {
      persistence: config.persistence !== false,
      storagePath:
        config.storagePath || path.join(process.cwd(), '.claude', 'lib', 'ml', 'patterns.json'),
      ...config,
    };

    this.patterns = new Map();
    this.nextId = 1;

    // Load from disk if persistence enabled
    if (this.config.persistence) {
      this._loadFromDisk();
    }
  }

  /**
   * Generate unique ID for a pattern
   * @returns {string} Unique ID
   */
  _generateId() {
    const id = `pattern-${this.nextId}`;
    this.nextId++;
    return id;
  }

  /**
   * Store a new pattern
   * @param {Object} pattern - Pattern to store
   * @returns {string} Pattern ID
   */
  store(pattern) {
    const id = this._generateId();
    const storedPattern = {
      ...pattern,
      id,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 1.0,
      },
    };

    this.patterns.set(id, storedPattern);

    if (this.config.persistence) {
      this._saveToDisk();
    }

    return id;
  }

  /**
   * Get pattern by ID
   * @param {string} id - Pattern ID
   * @returns {Object|null} Pattern or null
   */
  get(id) {
    return this.patterns.get(id) || null;
  }

  /**
   * Find patterns by type
   * @param {string} type - Pattern type
   * @returns {Array} Matching patterns
   */
  findByType(type) {
    return Array.from(this.patterns.values()).filter(p => p.type === type);
  }

  /**
   * Search patterns by name (partial match)
   * @param {string} query - Search query
   * @returns {Array} Matching patterns
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.patterns.values()).filter(
      p => p.name && p.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Record usage of a pattern
   * @param {string} id - Pattern ID
   */
  recordUsage(id) {
    const pattern = this.patterns.get(id);
    if (pattern) {
      pattern.metadata.usageCount++;
      pattern.metadata.updatedAt = new Date().toISOString();

      if (this.config.persistence) {
        this._saveToDisk();
      }
    }
  }

  /**
   * Record outcome (success/failure) for a pattern
   * @param {string} id - Pattern ID
   * @param {boolean} success - Whether usage was successful
   */
  recordOutcome(id, success) {
    const pattern = this.patterns.get(id);
    if (pattern) {
      if (success) {
        pattern.metadata.successCount++;
      } else {
        pattern.metadata.failureCount++;
      }

      const total = pattern.metadata.successCount + pattern.metadata.failureCount;
      pattern.metadata.successRate = total > 0 ? pattern.metadata.successCount / total : 1.0;
      pattern.metadata.updatedAt = new Date().toISOString();

      if (this.config.persistence) {
        this._saveToDisk();
      }
    }
  }

  /**
   * Calculate reusability score for a pattern
   * @param {string} id - Pattern ID
   * @returns {number} Reusability score (0-1)
   */
  getReusabilityScore(id) {
    const pattern = this.patterns.get(id);
    if (!pattern) return 0;

    const metadata = pattern.metadata;

    // Score components:
    // 1. Usage frequency (normalized, max contribution: 0.4)
    const maxUsage = this._getMaxUsage();
    const usageScore = maxUsage > 0 ? (metadata.usageCount / maxUsage) * 0.4 : 0;

    // 2. Success rate (max contribution: 0.4)
    const successScore = metadata.successRate * 0.4;

    // 3. Recency (patterns used recently score higher, max: 0.2)
    const daysSinceUpdate = this._daysSince(metadata.updatedAt);
    const recencyScore = Math.max(0, (30 - daysSinceUpdate) / 30) * 0.2;

    return Math.min(1, usageScore + successScore + recencyScore);
  }

  _getMaxUsage() {
    let max = 0;
    for (const pattern of this.patterns.values()) {
      if (pattern.metadata.usageCount > max) {
        max = pattern.metadata.usageCount;
      }
    }
    return max;
  }

  _daysSince(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    return diff / (1000 * 60 * 60 * 24);
  }

  /**
   * Rank patterns by reusability
   * @returns {Array} Patterns sorted by reusability score
   */
  rankByReusability() {
    const ranked = Array.from(this.patterns.values())
      .map(p => ({
        ...p,
        reusabilityScore: this.getReusabilityScore(p.id),
      }))
      .sort((a, b) => b.reusabilityScore - a.reusabilityScore);

    return ranked;
  }

  /**
   * Get library statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const patterns = Array.from(this.patterns.values());
    const stats = {
      totalPatterns: patterns.length,
      byType: {},
      totalUsage: 0,
      avgSuccessRate: 0,
    };

    for (const pattern of patterns) {
      // Count by type
      const type = pattern.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // Sum usage
      stats.totalUsage += pattern.metadata.usageCount;

      // Sum success rate
      stats.avgSuccessRate += pattern.metadata.successRate;
    }

    // Calculate average success rate
    if (patterns.length > 0) {
      stats.avgSuccessRate /= patterns.length;
    }

    return stats;
  }

  /**
   * Delete a pattern
   * @param {string} id - Pattern ID
   * @returns {boolean} Whether deletion was successful
   */
  delete(id) {
    const deleted = this.patterns.delete(id);

    if (deleted && this.config.persistence) {
      this._saveToDisk();
    }

    return deleted;
  }

  /**
   * Update a pattern
   * @param {string} id - Pattern ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated pattern or null
   */
  update(id, updates) {
    const pattern = this.patterns.get(id);
    if (!pattern) return null;

    // Merge updates (but preserve metadata)
    const updated = {
      ...pattern,
      ...updates,
      id: pattern.id, // Preserve ID
      metadata: {
        ...pattern.metadata,
        updatedAt: new Date().toISOString(),
      },
    };

    this.patterns.set(id, updated);

    if (this.config.persistence) {
      this._saveToDisk();
    }

    return updated;
  }

  /**
   * Export library to JSON
   * @returns {string} JSON string
   */
  export() {
    const data = {
      patterns: Array.from(this.patterns.values()),
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import patterns from JSON
   * @param {string} json - JSON string
   * @param {Object} options - Options (merge: boolean)
   */
  import(json, options = {}) {
    const { safeParseJSON } = require('./safe-json.cjs');
    const data = safeParseJSON(json, null);
    if (
      !data ||
      (typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data).length === 0 &&
        !data.patterns)
    ) {
      throw new Error('Failed to parse pattern library JSON: invalid or malformed input');
    }

    if (!options.merge) {
      this.patterns.clear();
    }

    for (const pattern of data.patterns || []) {
      // Generate new ID to avoid conflicts
      const newId = this._generateId();
      this.patterns.set(newId, {
        ...pattern,
        id: newId,
      });
    }

    if (this.config.persistence) {
      this._saveToDisk();
    }
  }

  /**
   * Load patterns from disk
   * @private
   */
  _loadFromDisk() {
    try {
      if (fs.existsSync(this.config.storagePath)) {
        const data = fs.readFileSync(this.config.storagePath, 'utf8');
        const parsed = safeParseJSON(data);

        for (const pattern of parsed.patterns || []) {
          this.patterns.set(pattern.id, pattern);
          // Update nextId to avoid conflicts
          const numId = parseInt(pattern.id.replace('pattern-', ''), 10);
          if (!isNaN(numId) && numId >= this.nextId) {
            this.nextId = numId + 1;
          }
        }
      }
    } catch (_err) {
      // Silently ignore - will start with empty library
    }
  }

  /**
   * Save patterns to disk
   * @private
   */
  _saveToDisk() {
    try {
      const dir = path.dirname(this.config.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        patterns: Array.from(this.patterns.values()),
        savedAt: new Date().toISOString(),
        version: '1.0',
      };

      fs.writeFileSync(this.config.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (_err) {
      // Silently ignore write errors
    }
  }

  /**
   * Clear all patterns
   */
  clear() {
    this.patterns.clear();
    this.nextId = 1;

    if (this.config.persistence) {
      this._saveToDisk();
    }
  }
}

module.exports = { PatternLibrary };
