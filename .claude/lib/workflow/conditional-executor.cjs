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
    const expr = String(expression || '').trim();
    if (!expr) return false;

    if (/[;`{}[\]\\]/.test(expr)) {
      throw new Error('unsafe expression blocked');
    }
    if (/\b(constructor|function|=>|new|process|global|this|require|import|eval)\b/i.test(expr)) {
      throw new Error('unsafe expression blocked');
    }

    const tokenRegex =
      /\s*(\(|\)|&&|\|\||===|!==|>=|<=|==|!=|>|<|!|true|false|null|undefined|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*/gy;
    const tokens = [];
    let lastIndex = 0;
    let match;
    while ((match = tokenRegex.exec(expr)) !== null) {
      if (match.index !== lastIndex) {
        throw new Error('unsafe expression blocked');
      }
      tokens.push(match[1]);
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex !== expr.length) {
      throw new Error('unsafe expression blocked');
    }

    const ctx = context || {};
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = expected => {
      const tok = tokens[pos];
      if (expected && tok !== expected) {
        throw new Error('unsafe expression blocked');
      }
      pos += 1;
      return tok;
    };

    const parseIdentifier = token => {
      const parts = token.split('.');
      let base = ctx;
      if (parts[0] === 'ctx') {
        parts.shift();
      } else if (Object.prototype.hasOwnProperty.call(ctx, parts[0])) {
        base = ctx[parts.shift()];
      } else {
        return undefined;
      }
      for (const part of parts) {
        if (base == null || typeof base !== 'object') return undefined;
        base = base[part];
      }
      return base;
    };

    const parsePrimary = () => {
      const tok = peek();
      if (tok === '(') {
        consume('(');
        const value = parseOr();
        consume(')');
        return value;
      }
      if (tok === 'true' || tok === 'false') {
        consume();
        return tok === 'true';
      }
      if (tok === 'null') {
        consume();
        return null;
      }
      if (tok === 'undefined') {
        consume();
        return undefined;
      }
      if (/^-?\d+(?:\.\d+)?$/.test(tok)) {
        consume();
        return Number(tok);
      }
      if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
        consume();
        return tok.slice(1, -1);
      }
      if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(tok)) {
        consume();
        return parseIdentifier(tok);
      }
      throw new Error('unsafe expression blocked');
    };

    const parseUnary = () => {
      if (peek() === '!') {
        consume('!');
        return !parseUnary();
      }
      return parsePrimary();
    };

    const parseComparison = () => {
      const left = parseUnary();
      const op = peek();
      if (!['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(op)) {
        return left;
      }
      consume();
      const right = parseUnary();
      switch (op) {
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '==':
          // eslint-disable-next-line eqeqeq -- legacy loose equality behavior for condition expressions
          return left == right;
        case '!=':
          // eslint-disable-next-line eqeqeq -- legacy loose inequality behavior for condition expressions
          return left != right;
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
        default:
          return false;
      }
    };

    const parseAnd = () => {
      let value = parseComparison();
      while (peek() === '&&') {
        consume('&&');
        value = Boolean(value) && Boolean(parseComparison());
      }
      return value;
    };

    const parseOr = () => {
      let value = parseAnd();
      while (peek() === '||') {
        consume('||');
        value = Boolean(value) || Boolean(parseAnd());
      }
      return value;
    };

    try {
      const result = parseOr();
      if (pos !== tokens.length) {
        throw new Error('unsafe expression blocked');
      }
      return result;
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
