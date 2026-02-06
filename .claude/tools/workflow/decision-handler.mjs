#!/usr/bin/env node

/**
 * Decision Handler Tool
 * Handles conditional logic and decision-making in workflows
 */

import fs from 'fs/promises';

class DecisionHandler {
  constructor() {
    this.name = 'decision-handler';
    this.description = 'Evaluates conditions and makes routing decisions in workflows';
  }

  async evaluateCondition(condition, context) {
    try {
      // Parse condition if it's a string
      if (typeof condition === 'string') {
        // Simple condition evaluation (can be extended with more complex logic)
        if (condition.includes('&&') || condition.includes('||')) {
          return this.evaluateComplexCondition(condition, context);
        }

        // Check for context variables
        if (condition.startsWith('context.')) {
          const contextPath = condition.replace('context.', '');
          return this.getNestedValue(context, contextPath.split('.'));
        }

        // Check for file existence
        if (condition.startsWith('file.exists:')) {
          const filePath = condition.replace('file.exists:', '');
          return await this.checkFileExists(filePath);
        }

        // Check for environment variables
        if (condition.startsWith('env.')) {
          const envVar = condition.replace('env.', '');
          return process.env[envVar] !== undefined;
        }

        // Direct boolean evaluation
        return Boolean(condition);
      }

      // If condition is an object, evaluate it
      if (typeof condition === 'object') {
        return await this.evaluateObjectCondition(condition, context);
      }

      return Boolean(condition);
    } catch (error) {
      console.error('Error evaluating condition:', error);
      return false;
    }
  }

  evaluateComplexCondition(condition, context) {
    // Replace context variables
    let processedCondition = condition;
    const contextMatches = condition.match(/context\.[a-zA-Z_][a-zA-Z0-9_.]*/g);
    if (contextMatches) {
      for (const match of contextMatches) {
        const value = this.getNestedValue(context, match.replace('context.', '').split('.'));
        // Safely escape the value for string replacement
        const safeValue = typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : value;
        processedCondition = processedCondition.replace(match, safeValue);
      }
    }

    // Use a safe expression evaluator instead of eval()
    return this.safeEvaluateExpression(processedCondition);
  }

  safeEvaluateExpression(expression) {
    // Only allow safe operations: &&, ||, ==, !=, <, >, <=, >=, and basic arithmetic
    const allowedPattern = /^[\s\w\d'"&|!=<>+\-*/().\s]+$/;

    if (!allowedPattern.test(expression)) {
      console.error('Unsafe expression detected:', expression);
      return false;
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(/,
      /process\s*\./,
      /global\s*\./,
      /__dirname/,
      /__filename/,
      /constructor/,
      /prototype/,
      /__proto__/,
      /this\./
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        console.error('Dangerous pattern detected in expression:', expression);
        return false;
      }
    }

    try {
      // Create a safe evaluation context with limited globals
      const safeContext = {
        // Only allow basic operations
        Math: {
          min: Math.min,
          max: Math.max,
          abs: Math.abs,
          round: Math.round,
          floor: Math.floor,
          ceil: Math.ceil
        },
        // Allow basic string operations
        String: String,
        Number: Number,
        Boolean: Boolean,
        // Allow basic array operations
        Array: { isArray: Array.isArray }
      };

      // Use Function constructor instead of eval (still not perfect but better)
      // eslint-disable-next-line no-new-func
      const evaluator = new Function(...Object.keys(safeContext), `return (${expression});`);
      return evaluator(...Object.values(safeContext));
    } catch (error) {
      console.error('Error evaluating safe expression:', expression, error.message);
      return false;
    }
  }

  async evaluateObjectCondition(condition, context) {
    const { type, left, right, operator } = condition;

    if (type === 'comparison') {
      const leftValue = await this.evaluateCondition(left, context);
      const rightValue = await this.evaluateCondition(right, context);

      switch (operator) {
        case 'equals': return leftValue === rightValue;
        case 'not_equals': return leftValue !== rightValue;
        case 'greater_than': return leftValue > rightValue;
        case 'less_than': return leftValue < rightValue;
        case 'contains': return String(leftValue).includes(String(rightValue));
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

  async makeDecision(workflowStep, context) {
    const { conditions, defaultRoute } = workflowStep;

    for (const condition of conditions || []) {
      const result = await this.evaluateCondition(condition.condition, context);
      if (result) {
        return {
          route: condition.route,
          reason: condition.description || `Condition met: ${condition.condition}`,
          confidence: 1.0
        };
      }
    }

    return {
      route: defaultRoute || 'next',
      reason: 'Default route - no conditions met',
      confidence: 0.5
    };
  }

  async execute(input) {
    const { workflowStep, context = {} } = input;

    if (!workflowStep) {
      throw new Error('Workflow step is required');
    }

    const decision = await this.makeDecision(workflowStep, context);

    return {
      success: true,
      decision,
      timestamp: new Date().toISOString(),
      handler: this.name
    };
  }
}

// Export for module usage
export default DecisionHandler;

// CLI usage
const isMainModule = import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMainModule) {
  const handler = new DecisionHandler();

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
    console.log('Usage: node decision-handler.mjs <json-input>');
    console.log('Example: node decision-handler.mjs \'{"workflowStep": {"conditions": [{"condition": "true", "route": "success"}]}, "context": {}}\'');
    process.exit(1);
  }
}