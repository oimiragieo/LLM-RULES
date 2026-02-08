/**
 * Result Streamer - Stream workflow results as they become available
 *
 * Features:
 * - Async generator-based streaming
 * - Backpressure handling
 * - Progress events
 * - Error handling (continue on error)
 * - Result filtering/transformation
 * - Parallel streaming
 * - Abort support
 *
 * @module result-streamer
 */

/* global DOMException */

const EventEmitter = require('events');

class ResultStreamer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bufferSize = options.bufferSize || 10;
    this.continueOnError = options.continueOnError || false;
    this.filter = options.filter || null;
    this.transform = options.transform || null;
    this.parallel = options.parallel || false;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.closed = false;
  }

  /**
   * Stream workflow results
   */
  async *stream(workflow, options = {}) {
    this.closed = false;
    const { signal } = options;

    if (this.parallel) {
      yield* this._streamParallel(workflow, signal);
    } else {
      yield* this._streamSequential(workflow, signal);
    }

    this.closed = true;
  }

  /**
   * Stream results sequentially
   */
  async *_streamSequential(workflow, signal) {
    for (const phase of workflow.phases) {
      // Check abort signal
      if (signal?.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }

      try {
        // Emit progress
        this.emit('progress', { phase: phase.name, status: 'executing' });

        // Execute phase
        const result = await phase.execute();

        // Apply filter
        if (this.filter && !this.filter(result)) {
          continue;
        }

        // Apply transform
        const finalResult = this.transform ? this.transform(result) : result;

        // Yield result
        yield finalResult;

        // Emit progress
        this.emit('progress', { phase: phase.name, status: 'completed', result: finalResult });
      } catch (error) {
        if (this.continueOnError) {
          yield error;
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Stream results in parallel with concurrency control
   */
  async *_streamParallel(workflow, signal) {
    const queue = [...workflow.phases];
    const executing = new Set();
    const results = [];

    while (queue.length > 0 || executing.size > 0) {
      // Check abort signal
      if (signal?.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }

      // Start new tasks up to maxConcurrent
      while (queue.length > 0 && executing.size < this.maxConcurrent) {
        const phase = queue.shift();
        const task = this._executePhase(phase);
        executing.add(task);

        task.then(
          result => {
            executing.delete(task);
            results.push(result);
          },
          error => {
            executing.delete(task);
            if (this.continueOnError) {
              results.push(error);
            }
          }
        );
      }

      // Wait for at least one task to complete
      if (executing.size > 0) {
        await Promise.race(executing);
      }

      // Yield all completed results
      while (results.length > 0) {
        const result = results.shift();

        // Apply filter
        if (this.filter && !this.filter(result)) {
          continue;
        }

        // Apply transform
        const finalResult = this.transform ? this.transform(result) : result;
        yield finalResult;
      }
    }
  }

  /**
   * Execute phase
   */
  async _executePhase(phase) {
    this.emit('progress', { phase: phase.name, status: 'executing' });

    try {
      const result = await phase.execute();
      this.emit('progress', { phase: phase.name, status: 'completed', result });
      return result;
    } catch (error) {
      this.emit('progress', { phase: phase.name, status: 'failed', error });
      throw error;
    }
  }

  /**
   * Check if stream is closed
   */
  isClosed() {
    return this.closed;
  }
}

module.exports = ResultStreamer;
