/**
 * Dynamic Task Generator
 *
 * Generates tasks at runtime from data:
 * - generate: create tasks from data
 * - generateAndExecute: generate and run tasks
 * - generateHierarchy: nested task hierarchies
 * - generateWithDependencies: tasks with dependency graph
 * - generateLazy: lazy generation from generators
 * - generateInBatches: batch generation
 */

class DynamicTaskGenerator {
  async generate(data, template, options = {}) {
    const {
      filter = null,
      deduplicate = false,
      sortByPriority = false,
      continueOnError = false,
      maxTasks = null,
    } = options;

    let items = data;

    // Apply filter
    if (filter) {
      items = items.filter(filter);
    }

    // Generate tasks
    let tasks = [];
    const errors = [];

    for (const item of items) {
      try {
        const task = await template(item);
        tasks.push(task);
      } catch (error) {
        if (continueOnError) {
          errors.push(error);
        } else {
          throw error;
        }
      }
    }

    // Deduplicate
    if (deduplicate) {
      const seen = new Set();
      tasks = tasks.filter(task => {
        if (seen.has(task.id)) {
          return false;
        }
        seen.add(task.id);
        return true;
      });
    }

    // Sort by priority
    if (sortByPriority) {
      tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    // Limit tasks
    if (maxTasks) {
      tasks = tasks.slice(0, maxTasks);
    }

    if (continueOnError) {
      return { tasks, errors };
    }

    return tasks;
  }

  async generateAndExecute(data, template, options = {}) {
    const { context = null, validate = false } = options;

    const tasks = await this.generate(data, item => template(item, context), options);

    // Validate
    if (validate) {
      for (const task of tasks) {
        if (!task.fn || typeof task.fn !== 'function') {
          throw new Error('Task missing fn property');
        }
      }
    }

    // Execute
    const results = [];
    for (const task of tasks) {
      const result = await task.fn();
      results.push(result);
    }

    return results;
  }

  async generateHierarchy(data, options = {}) {
    const { parentTemplate, childTemplate } = options;

    const hierarchy = [];

    for (const item of data) {
      const parent = await parentTemplate(item);

      // Generate children
      const children = [];
      if (item.tasks) {
        for (const childItem of item.tasks) {
          const child = await childTemplate(childItem);
          children.push(child);
        }
      }

      parent.children = children;
      hierarchy.push(parent);
    }

    return hierarchy;
  }

  async generateWithDependencies(data, options = {}) {
    const { template, getDependencies } = options;

    const tasks = [];
    const taskMap = new Map();

    // Generate all tasks
    for (const item of data) {
      const task = await template(item);
      tasks.push(task);
      taskMap.set(task.id, task);
    }

    // Set dependencies
    for (const item of data) {
      const task = taskMap.get(item.id);
      const deps = getDependencies(item);
      task.dependencies = deps || [];
    }

    return tasks;
  }

  async generateLazy(dataGenerator, template, options = {}) {
    const { limit = 10 } = options;

    const tasks = [];
    const iterator = dataGenerator[Symbol.iterator]();

    for (let i = 0; i < limit; i++) {
      const { value, done } = iterator.next();

      if (done) {
        break;
      }

      const task = await template(value);
      tasks.push(task);
    }

    return tasks;
  }

  async generateInBatches(data, template, options = {}) {
    const { batchSize = 10 } = options;

    const batches = [];

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const tasks = [];

      for (const item of batch) {
        const task = await template(item);
        tasks.push(task);
      }

      batches.push(tasks);
    }

    return batches;
  }
}

module.exports = { DynamicTaskGenerator };
