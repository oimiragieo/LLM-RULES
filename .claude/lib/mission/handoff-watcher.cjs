'use strict';

/**
 * Handoff Directory Watcher
 *
 * EventEmitter-based directory watcher for handoffs/.
 * Detects new .json files and emits 'handoff-detected' with parsed payload.
 *
 * Features:
 * - Platform-specific watching: fs.watch (Unix) / fs.watchFile polling (Windows)
 * - Debounce: 500ms window, same file triggers max 1 event
 * - FIFO ordering: files sorted by timestamp prefix in filename
 * - Malformed JSON: emits 'handoff-error', continues watching
 * - Partially-written files: retried 3x with 200ms delay
 * - Non-.json and deletions: ignored
 * - Clean start/stop lifecycle
 */

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  collectProcessableFiles,
  compareFilenames,
  extractTimestamp,
  forgetFile,
  getFileSignature,
  hasUnprocessedChanges,
  markProcessed,
} = require('./handoff-watcher-queue.cjs');

// Configuration constants
const DEBOUNCE_MS = 500;
const POLLING_INTERVAL_MS = 1000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 200;

/**
 * HandoffWatcher class
 *
 * Watches a directory for new .json files and emits events when detected.
 */
class HandoffWatcher extends EventEmitter {
  /**
   * @param {string} handoffsDir - Path to the handoffs directory
   * @param {Object} options - Configuration options
   * @param {number} options.debounceMs - Debounce window in milliseconds
   * @param {number} options.pollingIntervalMs - Polling interval for Windows
   * @param {number} options.retryCount - Number of retries for partial writes
   * @param {number} options.retryDelayMs - Delay between retries
   */
  constructor(handoffsDir, options = {}) {
    super();

    this.handoffsDir = path.normalize(handoffsDir);
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.pollingIntervalMs = options.pollingIntervalMs ?? POLLING_INTERVAL_MS;
    this.retryCount = options.retryCount ?? RETRY_COUNT;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;

    // State
    this.watcher = null;
    this.pollingTimer = null;
    this.processingTimer = null;
    this.isWatching = false;

    // Tracking for debounce
    this.lastProcessedTime = new Map(); // filename -> timestamp when last processed
    this.processedFileSignatures = new Map(); // filename -> "size:mtimeMs"
    this.pendingFiles = []; // Files queued for processing
    this.isProcessing = false;
  }

  /**
   * Start watching the handoffs directory
   */
  start() {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.lastProcessedTime.clear();
    this.pendingFiles = [];

    // Process existing files first (for FIFO ordering)
    this._processExistingFiles();

    // Start watching based on platform
    if (process.platform === 'win32') {
      this._startPolling();
    } else {
      this._startWatcher();
    }
  }

  /**
   * Stop watching and clean up resources
   */
  stop() {
    this.isWatching = false;

    // Close fs.watch watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear polling timer
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Clear processing timer
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }

    // Clear state
    this.lastProcessedTime.clear();
    this.processedFileSignatures.clear();
    this.pendingFiles = [];
    this.isProcessing = false;
  }

  /**
   * Process files that already exist in the directory
   * @private
   */
  async _processExistingFiles() {
    try {
      const files = fs.readdirSync(this.handoffsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Sort by FIFO order
      jsonFiles.sort(compareFilenames);

      // Process each file sequentially in FIFO order
      for (const file of jsonFiles) {
        await this._readWithRetryAsync(path.join(this.handoffsDir, file), file, 0);
      }
    } catch (err) {
      // Directory might not exist yet, that's okay
      if (err.code !== 'ENOENT') {
        this.emit('error', err);
      }
    }
  }

  /**
   * Start fs.watch for non-Windows platforms
   * @private
   */
  _startWatcher() {
    try {
      this.watcher = fs.watch(
        this.handoffsDir,
        { persistent: false, recursive: false },
        (eventType, filename) => {
          if (!this.isWatching || !filename) return;

          this._handleFileEvent(filename, eventType);
        }
      );

      this.watcher.on('error', err => {
        if (err.code === 'ENOENT') {
          // Directory was deleted, stop watching
          this.stop();
        } else {
          this.emit('error', err);
        }
      });
    } catch (err) {
      // Directory might not exist
      if (err.code !== 'ENOENT') {
        this.emit('error', err);
      }
    }
  }

  /**
   * Start polling for Windows platform
   * @private
   */
  _startPolling() {
    // On Windows, fs.watch can be unreliable on NTFS
    // Use polling as primary mechanism

    this.pollingTimer = setInterval(() => {
      if (!this.isWatching) {
        return;
      }

      try {
        const files = fs.readdirSync(this.handoffsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
          // Check if this file changed since the last successful/error processing pass.
          if (hasUnprocessedChanges(this, file)) {
            this._handleFileEvent(file, 'change');
          }
        }
      } catch (err) {
        // Directory might not exist
        if (err.code !== 'ENOENT') {
          this.emit('error', err);
        }
      }
    }, this.pollingIntervalMs);

    // Also try fs.watch for faster response on some Windows systems
    try {
      this.watcher = fs.watch(
        this.handoffsDir,
        { persistent: false, recursive: false },
        (eventType, filename) => {
          if (!this.isWatching || !filename) return;
          this._handleFileEvent(filename, eventType);
        }
      );

      this.watcher.on('error', () => {
        // Ignore watcher errors on Windows, polling will handle it
      });
    } catch (_err) {
      // fs.watch might fail on Windows, that's fine
    }
  }

  /**
   * Handle a file system event
   * @param {string} filename - Filename that triggered the event
   * @param {string} _eventType - 'rename' or 'change'
   * @private
   */
  _handleFileEvent(filename, _eventType) {
    // Only process .json files
    if (!filename.endsWith('.json')) {
      return;
    }

    // Ignore deletions and unchanged duplicate watcher events.
    const signature = getFileSignature(this, filename);
    if (!signature) {
      forgetFile(this, filename);
      return;
    }
    if (this.processedFileSignatures.get(filename) === signature) {
      return;
    }

    // Add to pending queue if not already there
    if (!this.pendingFiles.includes(filename)) {
      this.pendingFiles.push(filename);
    }

    // Schedule processing
    this._scheduleProcessing();
  }

  /**
   * Schedule batch processing after debounce period
   * @private
   */
  _scheduleProcessing() {
    // Clear existing timer
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    // Schedule processing after debounce period
    this.processingTimer = setTimeout(() => {
      this._processPendingFiles();
    }, this.debounceMs);
  }

  /**
   * Process pending files in FIFO order (sequentially)
   * @private
   */
  async _processPendingFiles() {
    if (this.isProcessing) {
      this._scheduleProcessing();
      return;
    }

    const toProcess = collectProcessableFiles(this);
    if (toProcess.length === 0) {
      this.pendingFiles = [];
      return;
    }

    this.pendingFiles = [];
    this.isProcessing = true;

    try {
      // Process each file sequentially in FIFO order
      for (const filename of toProcess) {
        if (!this.isWatching) break;

        // Read and process the file, waiting for completion
        const filePath = path.join(this.handoffsDir, filename);
        await this._readWithRetryAsync(filePath, filename, 0);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Read a file with retry logic (async/promise version for sequential processing)
   * @param {string} filePath - Full file path
   * @param {string} filename - Filename for events
   * @param {number} attempt - Current attempt number
   * @returns {Promise<void>}
   * @private
   */
  _readWithRetryAsync(filePath, filename, attempt) {
    return new Promise(resolve => {
      fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
          // File doesn't exist or was deleted - ignore
          if (err.code === 'ENOENT') {
            forgetFile(this, filename);
            resolve();
            return;
          }

          // Retry for transient errors
          if (attempt < this.retryCount) {
            setTimeout(() => {
              this._readWithRetryAsync(filePath, filename, attempt + 1).then(resolve);
            }, this.retryDelayMs);
            return;
          }

          // Emit error after retries exhausted
          this.emit('handoff-error', {
            filename,
            error: err.message,
          });
          markProcessed(this, filename);
          resolve();
          return;
        }

        // Try to parse JSON
        try {
          const payload = JSON.parse(content);
          // Add filename to payload for reference
          payload._filename = filename;
          markProcessed(this, filename);
          this.emit('handoff-detected', payload);
          resolve();
        } catch (parseErr) {
          // Retry for partial writes
          if (attempt < this.retryCount) {
            setTimeout(() => {
              this._readWithRetryAsync(filePath, filename, attempt + 1).then(resolve);
            }, this.retryDelayMs);
            return;
          }

          // Emit error after retries exhausted
          this.emit('handoff-error', {
            filename,
            error: parseErr.message,
          });
          markProcessed(this, filename);
          resolve();
        }
      });
    });
  }

  /**
   * Read a file with retry logic for partial writes
   * @param {string} filePath - Full file path
   * @param {string} filename - Filename for events
   * @param {number} attempt - Current attempt number
   * @private
   */
  _readWithRetry(filePath, filename, attempt) {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        // File doesn't exist or was deleted - ignore
        if (err.code === 'ENOENT') {
          forgetFile(this, filename);
          return;
        }

        // Retry for transient errors
        if (attempt < this.retryCount) {
          setTimeout(() => {
            this._readWithRetry(filePath, filename, attempt + 1);
          }, this.retryDelayMs);
          return;
        }

        // Emit error after retries exhausted
        this.emit('handoff-error', {
          filename,
          error: err.message,
        });
        markProcessed(this, filename);
        return;
      }

      // Try to parse JSON
      try {
        const payload = JSON.parse(content);
        // Add filename to payload for reference
        payload._filename = filename;
        markProcessed(this, filename);
        this.emit('handoff-detected', payload);
      } catch (parseErr) {
        // Retry for partial writes
        if (attempt < this.retryCount) {
          setTimeout(() => {
            this._readWithRetry(filePath, filename, attempt + 1);
          }, this.retryDelayMs);
          return;
        }

        // Emit error after retries exhausted
        this.emit('handoff-error', {
          filename,
          error: parseErr.message,
        });
        markProcessed(this, filename);
      }
    });
  }
}

/**
 * Create a new HandoffWatcher instance
 * @param {string} handoffsDir - Path to handoffs directory
 * @param {Object} options - Configuration options
 * @returns {HandoffWatcher}
 */
function createHandoffWatcher(handoffsDir, options = {}) {
  return new HandoffWatcher(handoffsDir, options);
}

module.exports = {
  HandoffWatcher,
  createHandoffWatcher,
  extractTimestamp,
  compareFilenames,
  DEBOUNCE_MS,
  POLLING_INTERVAL_MS,
  RETRY_COUNT,
  RETRY_DELAY_MS,
};
