#!/usr/bin/env node

/**
 * Loop Handler Tool
 * Handles iterative processing and loop control in workflows
 */

import fs from 'fs/promises';

class LoopHandler {
  constructor() {
    this.name = 'loop-handler';
    this.description = 'Manages iterative processing and loop control in workflows';
    this.maxIterations = 100; // Safety limit
  }

  async evaluateLoopCondition(condition, context, iteration) {
    try {
      // Parse condition if it's a string
      if (typeof condition === 'string') {
        // Check for iteration-based conditions
        if (condition.includes('iteration')) {
          return this.evaluateIterationCondition(condition, iteration);
        }

        // Check for context variables
        if (condition.startsWith('context.')) {
          const contextPath = condition.replace('context.', '');
          const value = this.getNestedValue(context, contextPath.split('.'));
          return Boolean(value);
        }

        // Check for file existence
        if (condition.startsWith('file.exists:')) {
          const filePath = condition.replace('file.exists:', '');
          return await this.checkFileExists(filePath);
        }

        // Direct boolean evaluation
        return Boolean(condition);
      }

      // If condition is an object, evaluate it
      if (typeof condition === 'object') {
        return await this.evaluateObjectCondition(condition, context, iteration);
      }

      return Boolean(condition);
    } catch (error) {
      console.error('Error evaluating loop condition:', error);
      return false;
    }
  }

  evaluateIterationCondition(condition, iteration) {
    // Handle iteration-based conditions
    if (condition.includes('iteration <')) {
      const maxIter = parseInt(condition.match(/iteration < (\d+)/)?.[1]);
      return iteration < maxIter;
    }

    if (condition.includes('iteration >')) {
      const minIter = parseInt(condition.match(/iteration > (\d+)/)?.[1]);
      return iteration > minIter;
    }

    if (condition.includes('iteration ==')) {
      const targetIter = parseInt(condition.match(/iteration == (\d+)/)?.[1]);
      return iteration === targetIter;
    }

    if (condition.includes('iteration <=') || condition.includes('iteration >=') ||
        condition.includes('iteration !=') || condition.includes('iteration !==')) {
      // Add more complex iteration conditions as needed
      return true; // Default to continue for unsupported conditions
    }

    return true; // Default to continue if condition is unclear
  }

  async evaluateObjectCondition(condition, context, iteration) {
    const { type, left, right, operator } = condition;

    if (type === 'iteration_limit') {
      return iteration < (condition.max_iterations || this.maxIterations);
    }

    if (type === 'comparison') {
      let leftValue = left;
      let rightValue = right;

      // Handle iteration variable
      if (left === 'iteration') leftValue = iteration;
      if (right === 'iteration') rightValue = iteration;

      // Handle context variables
      if (typeof left === 'string' && left.startsWith('context.')) {
        leftValue = this.getNestedValue(context, left.replace('context.', '').split('.'));
      }
      if (typeof right === 'string' && right.startsWith('context.')) {
        rightValue = this.getNestedValue(context, right.replace('context.', '').split('.'));
      }

      switch (operator) {
        case 'equals': return leftValue === rightValue;
        case 'not_equals': return leftValue !== rightValue;
        case 'greater_than': return leftValue > rightValue;
        case 'less_than': return leftValue < rightValue;
        case 'less_than_or_equal': return leftValue <= rightValue;
        case 'greater_than_or_equal': return leftValue >= rightValue;
        default: return false;
      }
    }

    return false;
  }

  getNestedValue(obj, path) {
    return path.reduce((current, key) => current?.[key], obj);
  }

  async checkFileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async shouldContinueLoop(workflowStep, context, iteration) {
    const { loop } = workflowStep;

    if (!loop) {
      return { continue: false, reason: 'No loop configuration' };
    }

    // Check iteration limit
    if (iteration >= (loop.max_iterations || this.maxIterations)) {
      return {
        continue: false,
        reason: `Maximum iterations reached: ${iteration}/${loop.max_iterations || this.maxIterations}`
      };
    }

    // Evaluate exit condition
    if (loop.exit_condition) {
      const shouldExit = await this.evaluateLoopCondition(loop.exit_condition, context, iteration);
      if (shouldExit) {
        return {
          continue: false,
          reason: `Exit condition met: ${loop.exit_condition}`
        };
      }
    }

    // Evaluate continue condition
    if (loop.continue_condition) {
      const shouldContinue = await this.evaluateLoopCondition(loop.continue_condition, context, iteration);
      return {
        continue: shouldContinue,
        reason: shouldContinue ? `Continue condition met: ${loop.continue_condition}` : `Continue condition not met: ${loop.continue_condition}`
      };
    }

    // Default: continue until max iterations
    return {
      continue: true,
      reason: 'Default continuation until max iterations'
    };
  }

  async executeLoopIteration(workflowStep, context, iteration) {
    const { loop } = workflowStep;

    // Execute loop body (this would typically delegate to other workflow steps)
    const loopContext = {
      ...context,
      loop: {
        iteration,
        max_iterations: loop.max_iterations || this.maxIterations,
        total_iterations: iteration + 1
      }
    };

    // Here you would execute the loop body steps
    // For now, we'll just return the updated context
    return {
      success: true,
      context: loopContext,
      iteration: iteration + 1,
      completed: false // Will be set by the loop controller
    };
  }

  async execute(input) {
    const { workflowStep, context = {}, iteration = 0 } = input;

    if (!workflowStep) {
      throw new Error('Workflow step is required');
    }

    const loopDecision = await this.shouldContinueLoop(workflowStep, context, iteration);

    if (!loopDecision.continue) {
      return {
        success: true,
        continue: false,
        reason: loopDecision.reason,
        final_iteration: iteration,
        timestamp: new Date().toISOString(),
        handler: this.name
      };
    }

    const iterationResult = await this.executeLoopIteration(workflowStep, context, iteration);

    return {
      success: true,
      continue: true,
      reason: loopDecision.reason,
      iteration: iterationResult.iteration,
      context: iterationResult.context,
      timestamp: new Date().toISOString(),
      handler: this.name
    };
  }
}

// Export for module usage
export default LoopHandler;

// CLI usage
const isMainModule = import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMainModule) {
  const handler = new LoopHandler();

  // Read from stdin or command line args
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : null;

  if (input) {
    handler.execute(input)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Usage: node loop-handler.mjs <json-input>');
    console.log('Example: node loop-handler.mjs \'{"workflowStep": {"loop": {"max_iterations": 5, "continue_condition": "iteration < 3"}}, "context": {}, "iteration": 0}\'');
    process.exit(1);
  }
}