'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Async Log Buffer
 * Buffers log entries in memory and flushes them to disk asynchronously using a WriteStream.
 * Prevents main thread blocking during high-throughput logging.
 */
class AsyncLogBuffer {
  constructor(options = {}) {
    this.buffer = [];
    this.bufferSize = 0;
    this.maxBufferSize = options.maxBufferSize || 64 * 1024; // 64KB flush trigger
    this.flushInterval = options.flushInterval || 500; // 500ms max latency
    this.filePath = options.filePath;
    this.writeStream = null;
    this.flushTimer = null;
    this.isFlushing = false;
  }

  setPath(filePath) {
    if (this.filePath !== filePath) {
      this.close(); // Close existing stream if path changes
      this.filePath = filePath;
    }
  }

  write(entry) {
    const line = JSON.stringify(entry) + '\n';
    this.buffer.push(line);
    this.bufferSize += Buffer.byteLength(line);

    if (this.bufferSize >= this.maxBufferSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
      if (this.flushTimer.unref) this.flushTimer.unref(); // Don't hold process open
    }
  }

  async flush() {
    if (this.buffer.length === 0 || this.isFlushing) return;
    if (!this.filePath) return;

    this.isFlushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const chunk = this.buffer.join('');
    this.buffer = [];
    this.bufferSize = 0;

    try {
      if (!this.writeStream) {
        // Ensure dir exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });
        this.writeStream.on('error', err => {
          console.error(`[AsyncLogBuffer] Stream error: ${err.message}`);
          this.writeStream = null; // Reset on error to retry next time
        });
      }

      if (!this.writeStream.write(chunk)) {
        // Backpressure: wait for drain if buffer full
        await new Promise(resolve => this.writeStream.once('drain', resolve));
      }
    } catch (err) {
      console.error(`[AsyncLogBuffer] Write error: ${err.message}`);
    } finally {
      this.isFlushing = false;
      // If new data arrived during flush, schedule next
      if (this.buffer.length > 0) {
        this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
        if (this.flushTimer.unref) this.flushTimer.unref();
      }
    }
  }

  /**
   * Final synchronous flush for process exit.
   */
  flushSync() {
    if (this.buffer.length === 0 || !this.filePath) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const chunk = this.buffer.join('');
    this.buffer = [];
    this.bufferSize = 0;

    try {
      // Use synchronous append to ensure it finishes before process dies
      fs.appendFileSync(this.filePath, chunk, 'utf8');
    } catch (_err) {
      // Best effort
    }
  }

  close() {
    this.flushSync();
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

module.exports = AsyncLogBuffer;
