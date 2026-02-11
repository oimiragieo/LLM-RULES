#!/usr/bin/env node
/**
 * Documentation Routing Guard Hook
 * Event: PreToolUse(Task)
 * Purpose: Ensure documentation requests are routed to technical-writer agent
 *
 * This hook detects documentation-related keywords in task prompts and
 * blocks/warns if the spawned agent is not technical-writer.
 *
 * ENFORCEMENT MODES:
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled
 *
 * Override via environment variable:
 *   DOCUMENTATION_ROUTING_GUARD=warn
 *   DOCUMENTATION_ROUTING_GUARD=off
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (in block mode)
 *
 * The hook fails open (exits 0) on errors to avoid blocking legitimate work.
 */

'use strict';

// PERF-006: Use shared hook-input utility instead of duplicated 55-line parseHookInput function
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

/**
 * Documentation-related keywords that indicate a doc task
 * High-confidence keywords that strongly indicate documentation work
 */
const DOC_KEYWORDS_HIGH = [
  'documentation',
  'document this',
  'write docs',
  'update docs',
  'create docs',
  'readme',
  'user guide',
  'api doc',
  'technical writing',
  'write guide',
  'how-to guide',
  'reference doc',
];

/**
 * Medium-confidence keywords (need multiple matches or context)
 */
const DOC_KEYWORDS_MEDIUM = [
  'document',
  'docs',
  'tutorial',
  'explain',
  'describe',
  'guide',
  'manual',
  'howto',
  'how-to',
];

/**
 * Patterns that indicate technical-writer agent spawn
 */
const TECH_WRITER_PATTERNS = {
  prompt: [
    'you are technical-writer',
    'you are the technical-writer',
    'as technical-writer',
    'you are tech-writer',
    'technical writer agent',
  ],
  description: ['technical-writer', 'tech-writer', 'documentation', 'writing docs'],
};

/**
 * Check if the prompt contains documentation-related intent
 * @param {string} text - The text to analyze
 * @returns {Object} { isDocTask: boolean, confidence: 'high'|'medium'|'low', matchedKeywords: string[] }
 */
function detectDocumentationIntent(text) {
  const textLower = text.toLowerCase();
  const matchedKeywords = [];

  // Check high-confidence keywords
  for (const keyword of DOC_KEYWORDS_HIGH) {
    if (textLower.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length > 0) {
    return {
      isDocTask: true,
      confidence: 'high',
      matchedKeywords,
    };
  }

  // Check medium-confidence keywords
  for (const keyword of DOC_KEYWORDS_MEDIUM) {
    if (textLower.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  // For medium keywords, require at least 2 matches or presence of "write" or "create"
  if (
    matchedKeywords.length >= 2 ||
    (matchedKeywords.length >= 1 && (textLower.includes('write') || textLower.includes('create')))
  ) {
    return {
      isDocTask: true,
      confidence: 'medium',
      matchedKeywords,
    };
  }

  return {
    isDocTask: false,
    confidence: 'low',
    matchedKeywords,
  };
}

/**
 * Check if the Task being spawned is a technical-writer agent
 * @param {Object} toolInput - The Task tool input
 * @returns {boolean} True if this is a technical-writer spawn
 */
function isTechWriterSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  // Check prompt patterns
  for (const pattern of TECH_WRITER_PATTERNS.prompt) {
    if (prompt.includes(pattern)) {
      return true;
    }
  }

  // Check description patterns
  for (const pattern of TECH_WRITER_PATTERNS.description) {
    if (description.includes(pattern)) {
      return true;
    }
  }

  return false;
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Format the violation message for output.
 *
 * @param {string[]} matchedKeywords - Keywords that triggered the detection
 * @param {string} confidence - Confidence level
 * @returns {string} Formatted violation message
 */
function formatViolationMessage(matchedKeywords, confidence) {
  return `[DOCUMENTATION ROUTING VIOLATION] Documentation task detected (${confidence} confidence).
Keywords matched: ${matchedKeywords.join(', ')}

Documentation tasks should be routed to technical-writer agent:
  Task({ subagent_type: 'general-purpose', description: 'Technical writer creating docs...',
    task_id: 'task-1',
         prompt: 'You are TECHNICAL-WRITER...' })

Set DOCUMENTATION_ROUTING_GUARD=off to disable (not recommended).`;
}

/**
 * Validate if Task spawn should be allowed
 * @param {Object} toolInput - The Task tool input
 * @returns {Object} { valid: boolean, error?: string }
 */
function validate(toolInput) {
  // Check enforcement mode
  const enforcement = process.env.DOCUMENTATION_ROUTING_GUARD || 'block';
  if (enforcement === 'off') {
    return { valid: true };
  }

  // Get the prompt being sent to the spawned agent
  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';
  const combinedText = `${prompt} ${description}`;

  // Detect if this is a documentation task
  const detection = detectDocumentationIntent(combinedText);

  if (!detection.isDocTask) {
    // Not a documentation task, allow
    return { valid: true };
  }

  // This is a documentation task - check if technical-writer is being spawned
  const isTechWriter = isTechWriterSpawn(toolInput);

  if (isTechWriter) {
    // Technical-writer is being spawned - allow
    return { valid: true };
  }

  // Documentation task but NOT spawning technical-writer
  const message = formatViolationMessage(detection.matchedKeywords, detection.confidence);

  return {
    valid: enforcement !== 'block',
    error: message,
  };
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // Check enforcement mode early
    const enforcement = process.env.DOCUMENTATION_ROUTING_GUARD || 'block';
    if (enforcement === 'off') {
      console.log(JSON.stringify({ result: 'allow', message: 'DOCUMENTATION_ROUTING_GUARD=off' }));
      process.exit(0);
    }

    // Parse the hook input
    const hookInput = await parseHookInput();

    if (!hookInput) {
      // No input provided - fail open
      console.log(JSON.stringify({ result: 'allow', message: 'No input provided' }));
      process.exit(0);
    }

    // PERF-006: Verify this is a Task tool call using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      // Not a Task tool - should not happen but fail open
      console.log(JSON.stringify({ result: 'allow', message: 'Not a Task tool call' }));
      process.exit(0);
    }

    // PERF-006: Get tool input using shared helper
    const toolInput = getToolInput(hookInput);

    // Validate
    const result = validate(toolInput);

    if (!result.valid) {
      // Block mode - output error and exit with code 2
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Task',
          reason: 'documentation_routing_violation',
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(JSON.stringify({ result: 'block', message: result.error }));
      process.exit(2);
    }

    // Warn mode or allowed
    if (result.error) {
      // Warn mode - show warning but allow
      console.log(JSON.stringify({ result: 'warn', message: result.error }));
    } else {
      console.log(
        JSON.stringify({ result: 'allow', message: 'Documentation routing check passed' })
      );
    }

    process.exit(0);
  } catch (err) {
    // Fail open on errors to avoid blocking legitimate work
    if (process.env.DEBUG_HOOKS) {
      console.error('Documentation routing guard error:', err.message);
      console.error('Stack trace:', err.stack);
    }
    console.log(JSON.stringify({ result: 'allow', message: 'Error - failing open' }));
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  validate,
  isTechWriterSpawn,
  detectDocumentationIntent,
  main,
  DOC_KEYWORDS_HIGH,
  DOC_KEYWORDS_MEDIUM,
  TECH_WRITER_PATTERNS,
};
