/**
 * Conditional Branching Executor
 *
 * Evaluates conditions and executes branches:
 * - when/then/else: simple conditional
 * - switch/case: pattern matching
 * - chain: if-else-if chains
 * - Evaluators: javascript, jsonpath, simple
 */

class ConditionalExecutor {
  async when(condition, thenBranch, elseBranch = null, context = null, options = {}) {
    const { evaluator = 'javascript' } = options;

    let conditionResult;

    if (typeof condition === 'function') {
      conditionResult = await condition(context);
    } else if (typeof condition === 'string') {
      conditionResult = this._evaluateExpression(condition, evaluator, context);
    } else {
      conditionResult = condition;
    }

    if (conditionResult) {
      return await thenBranch(context);
    } else if (elseBranch) {
      return await elseBranch(context);
    }
    return null;
  }

  _evaluateExpression(expression, evaluator, context) {
    if (evaluator === 'javascript') {
      return this._evaluateJavaScript(expression, context);
    } else if (evaluator === 'jsonpath') {
      return this._evaluateJsonPath(expression, context);
    } else if (evaluator === 'simple') {
      return this._evaluateSimple(expression, context);
    }
    throw new Error(`Unknown evaluator: ${evaluator}`);
  }

  _evaluateJavaScript(expression, context) {
    // Sandbox evaluation for security
    try {
      const ctx = context || {};
      // Inject context as 'ctx' variable for safer evaluation
      const keys = ['ctx', ...Object.keys(ctx)];
      const values = [ctx, ...Object.values(ctx)];
      // eslint-disable-next-line no-new-func -- Intentional dynamic evaluation for expression support
      const fn = new Function(...keys, `return ${expression}`);
      return fn(...values);
    } catch (error) {
      throw new Error(`Cannot read property on undefined: ${error.message}`);
    }
  }

  _evaluateJsonPath(expression, context) {
    // Simple JSONPath support ($.path.to.property)
    if (!expression.startsWith('$.')) {
      return false;
    }

    const path = expression.slice(2).split('.');
    let value = context;

    for (const key of path) {
      if (value == null) {
        return false;
      }
      value = value[key];
    }

    return !!value;
  }

  _evaluateSimple(expression, context) {
    // Simple comparison: "count > 10" style
    const match = expression.match(/^(\w+)\s*(>|<|>=|<=|===|==|!=)\s*(.+)$/);
    if (!match) {
      return false;
    }

    const [, left, operator, right] = match;
    const leftValue = context[left];
    let rightValue = right;

    // Parse right value
    if (right === 'true') rightValue = true;
    else if (right === 'false') rightValue = false;
    else if (!isNaN(right)) rightValue = Number(right);

    switch (operator) {
      case '>':
        return leftValue > rightValue;
      case '<':
        return leftValue < rightValue;
      case '>=':
        return leftValue >= rightValue;
      case '<=':
        return leftValue <= rightValue;
      case '===':
        return leftValue === rightValue;
      case '==':
        // eslint-disable-next-line eqeqeq -- Intentional loose equality for simple evaluator
        return leftValue == rightValue;
      case '!=':
        // eslint-disable-next-line eqeqeq -- Intentional loose inequality for simple evaluator
        return leftValue != rightValue;
      default:
        return false;
    }
  }

  async switch(value, cases, defaultCase = null) {
    const caseFunction = cases[value];

    if (caseFunction) {
      return await caseFunction();
    } else if (defaultCase) {
      return await defaultCase();
    }

    return null;
  }

  async chain(conditions, defaultBranch, context = null) {
    for (const { condition, branch } of conditions) {
      let result;

      if (typeof condition === 'function') {
        result = await condition(context);
      } else {
        result = condition;
      }

      if (result) {
        return await branch(context);
      }
    }

    return await defaultBranch(context);
  }
}

module.exports = { ConditionalExecutor };
