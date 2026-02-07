#!/usr/bin/env node

/**
 * Decision Handler Tool
 * Handles conditional logic and decision-making in workflows
 */

import fs from 'fs/promises';

/**
 * SafeExpressionParser - Recursive descent parser for boolean/comparison expressions.
 * SEC-TOOL-001 FIX: Only supports safe operations, no arbitrary code execution.
 *
 * Grammar:
 *   expr       = logicalOr
 *   logicalOr  = logicalAnd ('||' logicalAnd)*
 *   logicalAnd = unary ('&&' unary)*
 *   unary      = '!' unary | comparison
 *   comparison = primary (('===' | '!==' | '==' | '!=' | '>=' | '<=' | '>' | '<') primary)?
 *   primary    = '(' expr ')' | literal
 *   literal    = 'true' | 'false' | number | string
 */
class SafeExpressionParser {
  constructor(expression) {
    this.expression = expression;
    this.pos = 0;
    this.length = expression.length;
  }

  parse() {
    const result = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.length) {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.expression[this.pos]}'`);
    }
    return result;
  }

  parseExpression() {
    return this.parseLogicalOr();
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    this.skipWhitespace();
    while (this.pos < this.length && this.peek('||')) {
      this.pos += 2;
      const right = this.parseLogicalAnd();
      left = left || right;
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseUnary();
    this.skipWhitespace();
    while (this.pos < this.length && this.peek('&&')) {
      this.pos += 2;
      const right = this.parseUnary();
      left = left && right;
    }
    return left;
  }

  parseUnary() {
    this.skipWhitespace();
    if (this.pos < this.length && this.expression[this.pos] === '!') {
      // Make sure it's not !== or !=
      if (this.pos + 1 < this.length && this.expression[this.pos + 1] === '=') {
        return this.parseComparison();
      }
      this.pos += 1;
      const operand = this.parseUnary();
      return !operand;
    }
    return this.parseComparison();
  }

  parseComparison() {
    const left = this.parsePrimary();
    this.skipWhitespace();

    const op = this.matchOperator();
    if (op) {
      const right = this.parsePrimary();
      switch (op) {
        case '===': return left === right;
        case '!==': return left !== right;
        case '==': return left == right; // eslint-disable-line eqeqeq -- intentional loose equality for workflow expressions
        case '!=': return left != right; // eslint-disable-line eqeqeq -- intentional loose inequality for workflow expressions
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '<': return left < right;
        default: throw new Error(`Unknown operator: ${op}`);
      }
    }
    return left;
  }

  parsePrimary() {
    this.skipWhitespace();

    if (this.pos >= this.length) {
      throw new Error('Unexpected end of expression');
    }

    const ch = this.expression[this.pos];

    // Parenthesized expression
    if (ch === '(') {
      this.pos += 1;
      const result = this.parseExpression();
      this.skipWhitespace();
      if (this.pos >= this.length || this.expression[this.pos] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      this.pos += 1;
      return result;
    }

    // String literal (single-quoted)
    if (ch === "'") {
      return this.parseStringLiteral("'");
    }

    // String literal (double-quoted)
    if (ch === '"') {
      return this.parseStringLiteral('"');
    }

    // Number literal (including negative)
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      return this.parseNumber();
    }

    // Boolean / identifier keywords
    if (this.matchWord('true')) return true;
    if (this.matchWord('false')) return false;
    if (this.matchWord('null')) return null;
    if (this.matchWord('undefined')) return undefined;

    // Reject anything else (identifiers, function calls, etc.)
    throw new Error(`Unexpected token at position ${this.pos}: '${this.expression.slice(this.pos, this.pos + 20)}'`);
  }

  parseStringLiteral(quote) {
    this.pos += 1; // skip opening quote
    let str = '';
    while (this.pos < this.length) {
      const ch = this.expression[this.pos];
      if (ch === '\\' && this.pos + 1 < this.length) {
        this.pos += 1;
        const escaped = this.expression[this.pos];
        switch (escaped) {
          case "'": str += "'"; break;
          case '"': str += '"'; break;
          case '\\': str += '\\'; break;
          case 'n': str += '\n'; break;
          case 't': str += '\t'; break;
          default: str += escaped;
        }
        this.pos += 1;
        continue;
      }
      if (ch === quote) {
        this.pos += 1;
        return str;
      }
      str += ch;
      this.pos += 1;
    }
    throw new Error('Unterminated string literal');
  }

  parseNumber() {
    const start = this.pos;
    if (this.expression[this.pos] === '-') this.pos += 1;
    while (this.pos < this.length && this.expression[this.pos] >= '0' && this.expression[this.pos] <= '9') {
      this.pos += 1;
    }
    if (this.pos < this.length && this.expression[this.pos] === '.') {
      this.pos += 1;
      while (this.pos < this.length && this.expression[this.pos] >= '0' && this.expression[this.pos] <= '9') {
        this.pos += 1;
      }
    }
    const numStr = this.expression.slice(start, this.pos);
    const num = Number(numStr);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${numStr}`);
    }
    return num;
  }

  matchOperator() {
    this.skipWhitespace();
    // Order matters: check longer operators first
    for (const op of ['===', '!==', '==', '!=', '>=', '<=', '>', '<']) {
      if (this.expression.startsWith(op, this.pos)) {
        this.pos += op.length;
        return op;
      }
    }
    return null;
  }

  matchWord(word) {
    this.skipWhitespace();
    if (this.expression.startsWith(word, this.pos)) {
      // Ensure the word boundary (next char is not alphanumeric or underscore)
      const nextPos = this.pos + word.length;
      if (nextPos >= this.length || !/[a-zA-Z0-9_]/.test(this.expression[nextPos])) {
        this.pos = nextPos;
        return true;
      }
    }
    return false;
  }

  peek(str) {
    this.skipWhitespace();
    return this.expression.startsWith(str, this.pos);
  }

  skipWhitespace() {
    while (this.pos < this.length && /\s/.test(this.expression[this.pos])) {
      this.pos += 1;
    }
  }
}

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

    // Use a safe expression evaluator (recursive descent parser)
    return this.safeEvaluateExpression(processedCondition);
  }

  /**
   * Safe expression evaluator using recursive descent parsing.
   * SEC-TOOL-001 FIX: Replaces unsafe dynamic code execution with a parser that only supports:
   * - Literals: true, false, numbers, single-quoted strings, double-quoted strings
   * - Comparisons: ===, !==, ==, !=, >=, <=, >, <
   * - Logical: &&, ||, !
   * - Parentheses for grouping
   * - NO function calls, assignments, computed property access, template literals
   */
  safeEvaluateExpression(expression) {
    try {
      const parser = new SafeExpressionParser(expression);
      return parser.parse();
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
        case 'equals':
          return leftValue === rightValue;
        case 'not_equals':
          return leftValue !== rightValue;
        case 'greater_than':
          return leftValue > rightValue;
        case 'less_than':
          return leftValue < rightValue;
        case 'contains':
          return String(leftValue).includes(String(rightValue));
        default:
          return false;
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
          confidence: 1.0,
        };
      }
    }

    return {
      route: defaultRoute || 'next',
      reason: 'Default route - no conditions met',
      confidence: 0.5,
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
      handler: this.name,
    };
  }
}

// Export for module usage
export default DecisionHandler;

// CLI usage
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMainModule) {
  const handler = new DecisionHandler();

  // Read from stdin or command line args
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : null;

  if (input) {
    handler
      .execute(input)
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
    console.log(
      'Example: node decision-handler.mjs \'{"workflowStep": {"conditions": [{"condition": "true", "route": "success"}]}, "context": {}}\''
    );
    process.exit(1);
  }
}
