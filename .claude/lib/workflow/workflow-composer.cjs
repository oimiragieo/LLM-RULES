#!/usr/bin/env node
/**
 * SPEC-011: Workflow Composer (Test Implementation)
 * ===================================================
 *
 * Minimal WorkflowComposer for state machine advanced tests.
 * Composes multiple workflows into pipelines and patterns.
 *
 * Note: This is a minimal implementation for SPEC-011 tests.
 * SPEC-018 may have a more complete implementation.
 */

'use strict';

/**
 * WorkflowComposer
 *
 * Composes multiple workflows into pipelines and patterns.
 */
class WorkflowComposer {
  constructor(options = {}) {
    this.circuitBreaker = options.circuitBreaker ?? false;
    this.circuitBreakerFailures = 0;
    this.circuitBreakerThreshold = 5;
    this.circuitOpen = false;
  }

  /**
   * Create pipeline of workflows
   */
  async createPipeline(workflows, options = {}) {
    const stopOnError = options.stopOnError ?? true;

    return {
      execute: async () => {
        for (const wf of workflows) {
          await wf.transition('running');
          const currentState = await wf.getCurrentState();

          if (currentState === 'failed' && stopOnError) {
            throw new Error('Pipeline stopped due to workflow failure');
          }

          await wf.transition('completed');
        }
      },
    };
  }

  /**
   * Execute workflows in parallel
   */
  async executeParallel(workflows) {
    const promises = workflows.map(async wf => {
      await wf.transition('running');
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));
      await wf.transition('completed');
    });

    await Promise.all(promises);
  }

  /**
   * Create fan-out/fan-in pattern
   */
  async createFanOutFanIn(source, workers, sink) {
    return {
      execute: async () => {
        // Source completes
        await source.transition('running');
        await source.transition('completed');

        // Workers execute in parallel
        await this.executeParallel(workers);

        // Sink aggregates
        await sink.transition('running');
        await sink.transition('completed');
      },
    };
  }

  /**
   * Retry workflow with backoff
   */
  async retryWorkflow(workflow, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await workflow.transition('running');
        await workflow.transition('completed');
        return;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  /**
   * Execute workflow with circuit breaker
   */
  async execute(workflow) {
    if (this.circuitBreaker && this.circuitOpen) {
      throw new Error('Circuit breaker is open');
    }

    try {
      await workflow.transition('running');
      await workflow.transition('completed');
      this.circuitBreakerFailures = 0;
    } catch (err) {
      if (this.circuitBreaker) {
        this.circuitBreakerFailures++;
        if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
          this.circuitOpen = true;
        }
      }
      throw err;
    }
  }

  /**
   * Create saga pattern
   */
  async createSaga(steps) {
    return {
      execute: async () => {
        const completed = [];

        try {
          for (const step of steps) {
            await step.transition('running');
            completed.push(step);
            await step.transition('completed');
          }
        } catch (err) {
          // Compensate in reverse order
          for (let i = completed.length - 1; i >= 0; i--) {
            const step = completed[i];
            if (step.compensate) {
              await step.compensate();
            }
          }
          throw err;
        }
      },
    };
  }
}

module.exports = {
  WorkflowComposer,
};
