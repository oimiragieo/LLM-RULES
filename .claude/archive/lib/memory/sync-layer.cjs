// .claude/lib/memory/sync-layer.cjs
// Write-Ahead Log sync layer for hybrid memory system (Task #26)

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { EntityExtractor } = require('./entity-extractor.cjs');
const { retryWithBackoff } = require('../utils/retry-with-backoff.cjs');

/**
 * SyncLayer - Monitors memory files and syncs changes to SQLite + ChromaDB
 *
 * This class implements the Write-Ahead Log pattern:
 * 1. File writes happen synchronously (source of truth)
 * 2. Database syncs happen asynchronously (non-blocking)
 * 3. Debouncing prevents thrashing on rapid edits
 *
 * Events emitted:
 * - 'sync': File change detected, sync queued
 * - 'entities-extracted': Entities extracted from file
 * - 'vectors-updated': ChromaDB vectors updated
 * - 'sync-complete': Sync operation completed
 * - 'sync-error': Sync operation failed
 *
 * @class SyncLayer
 * @extends EventEmitter
 *
 * @example
 * const sync = new SyncLayer({
 *   memoryDir: '.claude/context/memory',
 *   dbPath: '.claude/data/memory.db',
 *   debounceMs: 2000
 * });
 * await sync.start();
 */
/**
 * @deprecated Replaced by sync-memory-index.cjs (PostToolUse hook).
 * SyncLayer assumed a long-lived Node process; Claude Code hooks are short-lived.
 * Do not use in new code. See .claude/hooks/memory/sync-memory-index.cjs.
 */
class SyncLayer extends EventEmitter {
  /**
   * Create SyncLayer instance
   *
   * @param {Object} config - Configuration options
   * @param {string} config.memoryDir - Directory containing memory files (default: .claude/context/memory)
   * @param {string} config.dbPath - Path to SQLite database (default: .claude/data/memory.db)
   * @param {number} config.debounceMs - Debounce delay in milliseconds (default: 2000)
   */
  constructor(config = {}) {
    super();

    // Default configuration
    const projectRoot = path.resolve(__dirname, '../../../');
    this.config = {
      memoryDir: config.memoryDir || path.join(projectRoot, '.claude/context/memory'),
      dbPath: config.dbPath || path.join(projectRoot, '.claude/data/memory.db'),
      debounceMs: config.debounceMs !== undefined ? config.debounceMs : 2000,
    };

    // State
    this.watchers = new Map(); // filePath -> FSWatcher
    this.debounceTimers = new Map(); // filePath -> Timer
    this.watching = false;

    // Entity extractor
    this.extractor = null;
  }

  /**
   * Start watching memory files
   *
   * Monitors learnings.md, decisions.md, and issues.md for changes.
   * On change, debounces and triggers entity extraction + database sync.
   *
   * @returns {Promise<void>}
   */
  start() {
    if (this.watching) {
      // Already watching - idempotent
      return;
    }

    // Initialize entity extractor
    try {
      this.extractor = new EntityExtractor(this.config.dbPath);
    } catch (error) {
      console.error('[SyncLayer] Failed to initialize EntityExtractor:', error.message);
      // Continue without extractor (file watching still works)
    }

    // Ensure memory directory exists
    if (!fs.existsSync(this.config.memoryDir)) {
      fs.mkdirSync(this.config.memoryDir, { recursive: true });
    }

    // Files to watch
    const filesToWatch = ['learnings.md', 'decisions.md', 'issues.md'];

    // Start watching each file
    for (const filename of filesToWatch) {
      const filePath = path.join(this.config.memoryDir, filename);

      // Create file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# ${filename}\n\nInitialized by SyncLayer\n`);
      }

      // Start watching
      const watcher = fs.watch(filePath, eventType => {
        if (eventType === 'change') {
          this._handleFileChange(filePath);
        }
      });

      this.watchers.set(filePath, watcher);
    }

    this.watching = true;
  }

  /**
   * Stop watching memory files
   *
   * Cleans up all file watchers and pending timers.
   *
   * @returns {Promise<void>}
   */
  stop() {
    // Stop all watchers
    for (const [_filePath, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();

    // Clear all debounce timers
    for (const [_filePath, timer] of this.debounceTimers.entries()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.watching = false;

    // Close entity extractor
    if (this.extractor) {
      this.extractor.close();
      this.extractor = null;
    }
  }

  /**
   * Check if currently watching files
   *
   * @returns {boolean} True if watching, false otherwise
   */
  isWatching() {
    return this.watching;
  }

  /**
   * Handle file change event (debounced)
   *
   * @private
   * @param {string} filePath - Path to changed file
   */
  _handleFileChange(filePath) {
    // Emit sync event
    this.emit('sync', { filePath, timestamp: Date.now() });

    // Clear existing timer
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    // Set new timer (debounce)
    const timer = setTimeout(async () => {
      await this._syncFile(filePath);
      this.debounceTimers.delete(filePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Sync file changes to databases with retry logic
   *
   * Uses exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 retries)
   * Only retries transient errors (EBUSY, EAGAIN, ETIMEDOUT)
   * Does NOT retry permanent errors (ENOENT, syntax errors, etc.)
   *
   * @param {string} filePath - Path to changed file
   * @returns {Promise<void>}
   */
  async syncChanges(filePath) {
    try {
      // Wrap sync operation with retry logic
      await retryWithBackoff(
        async () => {
          // Step 1: Extract entities from file
          if (!this.extractor) {
            throw new Error('EntityExtractor not initialized');
          }

          const { entities, relationships } = await this.extractor.extractFromFile(filePath);

          this.emit('entities-extracted', { filePath, entities, relationships });

          // Step 2: Store entities in SQLite
          await this.extractor.storeEntities(entities);
          await this.extractor.storeRelationships(relationships);

          // Step 3: Update ChromaDB vectors (TODO: Implement in Task #27)
          // For now, just emit event
          this.emit('vectors-updated', { filePath, count: entities.length });

          // Step 4: Emit sync-complete event (MOVED inside retry for proper emission)
          this.emit('sync-complete', {
            filePath,
            entitiesCount: entities.length,
            relationshipsCount: relationships.length,
          });

          // Step 5: Return completion metadata
          return {
            entitiesCount: entities.length,
            relationshipsCount: relationships.length,
          };
        },
        {
          maxRetries: 5,
          baseDelay: 1000,
          onRetry: (error, attempt) => {
            console.warn(
              `[SyncLayer] Retry attempt ${attempt}/5 for ${filePath}: ${error.message}`
            );
          },
        }
      );
    } catch (error) {
      // Max retries exceeded or permanent error
      console.error('[SyncLayer] Sync failed:', error.message);
      this.emit('sync-error', {
        filePath,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Sync file changes to databases (legacy method - no retry)
   *
   * @deprecated Use syncChanges() instead for retry logic
   * @private
   * @param {string} filePath - Path to changed file
   */
  async _syncFile(filePath) {
    try {
      // Step 1: Extract entities from file
      if (!this.extractor) {
        throw new Error('EntityExtractor not initialized');
      }

      const { entities, relationships } = await this.extractor.extractFromFile(filePath);

      this.emit('entities-extracted', { filePath, entities, relationships });

      // Step 2: Store entities in SQLite
      await this.extractor.storeEntities(entities);
      await this.extractor.storeRelationships(relationships);

      // Step 3: Update ChromaDB vectors (TODO: Implement in Task #27)
      // For now, just emit event
      this.emit('vectors-updated', { filePath, count: entities.length });

      // Step 4: Emit completion event
      this.emit('sync-complete', {
        filePath,
        entitiesCount: entities.length,
        relationshipsCount: relationships.length,
      });
    } catch (error) {
      // Emit error event
      this.emit('sync-error', {
        filePath,
        error: error.message,
        stack: error.stack,
      });
    }
  }
}

module.exports = { SyncLayer };
