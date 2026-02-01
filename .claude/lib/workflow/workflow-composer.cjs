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

  // -------------------------------------------------------------------------
  // SPEC-018: Workflow Composition & Nesting
  // -------------------------------------------------------------------------

  /**
   * Include a sub-workflow by path/reference
   * @param {string} workflowPath - Workflow id or path
   * @returns {Object} Reference object for resolution
   */
  include(workflowPath) {
    return { type: 'include', workflow: workflowPath };
  }

  /**
   * Extend a base workflow with overrides (add/remove/replace phases or tasks)
   * @param {Object} baseWorkflow - Base workflow definition { name, phases, ... }
   * @param {Object} overrides - { phaseName: { add: [...], remove: [...], replace: {...} } }
   * @returns {Object} Merged workflow definition
   */
  extend(baseWorkflow, overrides = {}) {
    const result = JSON.parse(JSON.stringify(baseWorkflow));
    if (!result.phases) result.phases = [];

    for (const [phaseKey, phaseOverrides] of Object.entries(overrides)) {
      if (!phaseOverrides || typeof phaseOverrides !== 'object') continue;

      let phase = result.phases.find(
        p => (typeof p === 'object' && p.name === phaseKey) || p === phaseKey
      );
      const phaseIndex = result.phases.findIndex(
        p => (typeof p === 'object' && p.name === phaseKey) || p === phaseKey
      );

      if (phaseOverrides.add && Array.isArray(phaseOverrides.add)) {
        for (const item of phaseOverrides.add) {
          const after = item.after;
          const tasks = phase && phase.tasks ? [...phase.tasks] : [];
          if (after) {
            const idx = tasks.findIndex(
              t => (typeof t === 'object' && t.task === after) || t === after
            );
            tasks.splice(idx >= 0 ? idx + 1 : tasks.length, 0, item.task || item);
            if (phase && typeof phase === 'object') phase.tasks = tasks;
            else if (phaseIndex >= 0) result.phases[phaseIndex] = { ...phase, tasks };
            else result.phases.push({ name: phaseKey, tasks });
          } else {
            tasks.push(item.task || item);
            if (phase && typeof phase === 'object') phase.tasks = tasks;
            else if (phaseIndex >= 0) result.phases[phaseIndex] = { ...phase, tasks };
            else result.phases.push({ name: phaseKey, tasks });
          }
          phase = result.phases[phaseIndex] || result.phases[result.phases.length - 1];
        }
      }

      if (phaseOverrides.remove && Array.isArray(phaseOverrides.remove)) {
        for (const taskId of phaseOverrides.remove) {
          if (phase && phase.tasks) {
            phase.tasks = phase.tasks.filter(t => (typeof t === 'object' ? t.task : t) !== taskId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Compose multiple workflows with a strategy
   * @param {Array<Object|string>} workflows - Array of workflow defs or ids
   * @param {string} strategy - 'sequential' | 'parallel' | 'conditional'
   * @returns {Object} Composed definition
   */
  compose(workflows, strategy = 'sequential') {
    return {
      type: 'composed',
      strategy,
      workflows: workflows.map(w => (typeof w === 'string' ? w : w.name || w.id || 'anonymous')),
      _workflows: workflows,
    };
  }

  /**
   * Flatten a workflow definition (resolve includes, apply extend, expand compose) into executable phases
   * @param {string} workflowId - Workflow id
   * @param {Object} resolver - WorkflowResolver instance with resolve(workflowId) returning def
   * @param {Object} options - { maxDepth: 10 }
   * @returns {Object} { phases: [...], name, ... }
   */
  async flatten(workflowId, resolver, options = {}, currentDepth = 0) {
    const maxDepth = options.maxDepth ?? 10;

    if (currentDepth > maxDepth) {
      throw new Error(`Workflow composition depth exceeded ${maxDepth}`);
    }

    const collectPhases = async (def, depth) => {
      if (depth > maxDepth) {
        throw new Error(`Workflow composition depth exceeded ${maxDepth}`);
      }
      if (!def) return [];

      if (def.extends) {
        const baseId = Array.isArray(def.extends) ? def.extends[0] : def.extends;
        const base = await resolver.resolve(baseId);
        const basePhases = await collectPhases(base, depth + 1);
        const merged = this.extend(
          { name: base.name || baseId, phases: basePhases },
          def.overrides || {}
        );
        const extendedPhases = merged.phases || [];
        if (def.phases && def.phases.length) {
          for (const phase of def.phases) {
            if (phase && phase.include) {
              const subFlat = await this.flatten(
                phase.include,
                resolver,
                { ...options, maxDepth },
                depth + 1
              );
              extendedPhases.push(...(subFlat.phases || []));
            } else {
              extendedPhases.push(phase);
            }
          }
        }
        return extendedPhases;
      }

      if (def.type === 'composed' && (def._workflows || def.workflows)) {
        const list = def._workflows || def.workflows;
        const out = [];
        for (const w of list) {
          const resolved = typeof w === 'string' ? await resolver.resolve(w) : w;
          const subPhases = await collectPhases(resolved, depth + 1);
          out.push(...subPhases);
        }
        return out;
      }

      const phases = [];
      if (def.phases && Array.isArray(def.phases)) {
        for (const phase of def.phases) {
          if (phase && phase.include) {
            const subFlat = await this.flatten(
              phase.include,
              resolver,
              { ...options, maxDepth },
              depth + 1
            );
            phases.push(...(subFlat.phases || []));
          } else {
            phases.push(phase);
          }
        }
      }
      return phases;
    };

    const def = await resolver.resolve(workflowId);
    const phases = await collectPhases(def, currentDepth);
    return { name: def.name || workflowId, phases };
  }
}

module.exports = {
  WorkflowComposer,
};
