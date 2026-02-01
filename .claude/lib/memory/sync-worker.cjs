// .claude/lib/memory/sync-worker.cjs
// Background sync worker for hybrid memory system (Task #30)

const { EventEmitter } = require('events');
const { SyncLayer } = require('./sync-layer.cjs');

/**
 * BackgroundSyncWorker - Periodic background sync for memory files
 *
 * Runs SyncLayer in the background using setInterval.
 * Syncs changes to SQLite and ChromaDB at configured intervals.
 *
 * Features:
 * - Configurable sync interval (default: 60000ms / 60 seconds)
 * - Environment variable: MEMORY_SYNC_INTERVAL_MS
 * - Graceful shutdown on process signals (SIGINT, SIGTERM)
 * - Lifecycle: start() / stop() / isRunning()
 * - Events: 'periodic-sync' emitted on each sync cycle
 *
 * @class BackgroundSyncWorker
 * @extends EventEmitter
 *
 * await worker.start();
 * // ... worker runs in background ...
 * await worker.stop();
 */
/**
 * @deprecated SyncLayer is deprecated; BackgroundSyncWorker is not used.
 * See .claude/lib/memory/sync-layer.cjs and .claude/hooks/memory/sync-memory-index.cjs.
 */
class BackgroundSyncWorker extends EventEmitter {
  /**
   * Create BackgroundSyncWorker instance
   *
   * @param {Object} config - Configuration options
   * @param {string} config.memoryDir - Directory containing memory files
   * @param {string} config.dbPath - Path to SQLite database
   * @param {number} config.intervalMs - Sync interval in milliseconds (default: 60000)
   */
  constructor(config = {}) {
    super();

    // Read interval from environment variable or config or default
    const envIntervalMs = process.env.MEMORY_SYNC_INTERVAL_MS
      ? parseInt(process.env.MEMORY_SYNC_INTERVAL_MS, 10)
      : null;

    // Config parameter takes precedence over env var
    const intervalMs = config.intervalMs !== undefined ? config.intervalMs : envIntervalMs || 60000;

    // Configuration
    this.config = {
      memoryDir: config.memoryDir,
      dbPath: config.dbPath,
      intervalMs,
    };

    // State
    this.running = false;
    this.intervalHandle = null;
    this.syncLayer = null;

    // Signal handlers for cleanup
    this.signalHandlers = {
      SIGINT: this._handleShutdown.bind(this),
      SIGTERM: this._handleShutdown.bind(this),
    };
  }

  /**
   * Start background worker
   *
   * Initializes SyncLayer, registers signal handlers, and starts periodic sync.
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      // Already running - idempotent
      return;
    }

    // Initialize SyncLayer
    this.syncLayer = new SyncLayer({
      memoryDir: this.config.memoryDir,
      dbPath: this.config.dbPath,
      debounceMs: 2000, // Use SyncLayer's default debounce
    });

    // Start watching files
    await this.syncLayer.start();

    // Register signal handlers for graceful shutdown
    process.on('SIGINT', this.signalHandlers.SIGINT);
    process.on('SIGTERM', this.signalHandlers.SIGTERM);

    // Start periodic sync
    this.intervalHandle = setInterval(() => {
      this._performSync();
    }, this.config.intervalMs);

    this.running = true;
  }

  /**
   * Stop background worker
   *
   * Cleans up interval timer, unregisters signal handlers, and stops SyncLayer.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      // Not running - idempotent
      return;
    }

    // Stop interval timer
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Unregister signal handlers
    process.removeListener('SIGINT', this.signalHandlers.SIGINT);
    process.removeListener('SIGTERM', this.signalHandlers.SIGTERM);

    // Stop SyncLayer
    if (this.syncLayer) {
      await this.syncLayer.stop();
      this.syncLayer = null;
    }

    this.running = false;
  }

  /**
   * Check if worker is running
   *
   * @returns {boolean} True if running, false otherwise
   */
  isRunning() {
    return this.running;
  }

  /**
   * Perform periodic sync (internal)
   *
   * Emits 'periodic-sync' event with timestamp.
   *
   * @private
   */
  _performSync() {
    // Emit periodic-sync event
    this.emit('periodic-sync', {
      timestamp: Date.now(),
    });

    // NOTE: SyncLayer already watches files and syncs automatically.
    // This periodic sync is a heartbeat to ensure the system is alive.
    // Actual syncing happens in SyncLayer via file watchers.
  }

  /**
   * Handle shutdown signals (SIGINT, SIGTERM)
   *
   * Gracefully stops the worker on process termination.
   *
   * @private
   */
  async _handleShutdown() {
    console.log('[BackgroundSyncWorker] Received shutdown signal, stopping gracefully...');
    await this.stop();
    process.exit(0);
  }
}

module.exports = { BackgroundSyncWorker };
