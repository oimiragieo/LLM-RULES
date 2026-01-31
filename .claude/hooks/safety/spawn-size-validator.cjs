#!/usr/bin/env node
/**
 * Spawn Size Validator Hook
 *
 * Validates spawn size before agent creation to prevent memory-intensive spawns.
 * Provides pruning suggestions when spawns exceed size thresholds.
 *
 * Exit codes:
 * - 0: Allow (spawn size within thresholds or mode=off)
 * - 1: Block (spawn size exceeds block threshold and mode=block)
 *
 * Environment Variables:
 * - SPAWN_SIZE_VALIDATOR: warn (default) | block | off
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputSync } = require('../../lib/utils/hook-input.cjs');

// Thresholds
const WARN_SIZE_KB = 15;
const WARN_TOOL_COUNT = 15;
const BLOCK_SIZE_KB = 25;
const BLOCK_TOOL_COUNT = 20;

// Size estimates (bytes)
const BASE_OVERHEAD = 4000;
const BYTES_PER_TOOL = 200;

// Orchestrators bypass validation (complex reasoning requires more resources)
const ORCHESTRATOR_TYPES = [
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
];

/**
 * Calculate spawn size in bytes/KB
 * @param {string[]} toolsArray - Array of tool names
 * @param {string} promptString - Spawn prompt
 * @param {string} templateString - Spawn template
 * @returns {Object} - { totalBytes, totalKB, toolCount, breakdown }
 */
function calculateSpawnSize(toolsArray, promptString, templateString) {
  const toolCount = toolsArray.length;
  const toolBytes = toolCount * BYTES_PER_TOOL;
  const promptBytes = promptString.length;
  const templateBytes = templateString.length;

  const totalBytes = BASE_OVERHEAD + toolBytes + promptBytes + templateBytes;
  const totalKB = Math.round((totalBytes / 1024) * 10) / 10;

  return {
    totalBytes,
    totalKB,
    toolCount,
    breakdown: {
      base: BASE_OVERHEAD,
      tools: toolBytes,
      prompt: promptBytes,
      template: templateBytes,
    },
  };
}

/**
 * Validate spawn size against thresholds
 * @param {number} sizeKB - Size in KB
 * @param {number} toolCount - Number of tools
 * @param {string} mode - 'warn', 'block', 'off'
 * @returns {Object} - { status: 'pass'|'warn'|'block', message: string }
 */
function validateSpawnSize(sizeKB, toolCount, mode) {
  if (mode === 'off') {
    return { status: 'pass', message: '' };
  }

  // Check block thresholds
  if (sizeKB >= BLOCK_SIZE_KB || toolCount >= BLOCK_TOOL_COUNT) {
    if (mode === 'block') {
      const message = `⚠️  SPAWN SIZE BLOCKED: ${sizeKB} KB (${toolCount} tools)
Reason: Exceeds block threshold (${BLOCK_SIZE_KB} KB, ${BLOCK_TOOL_COUNT} tools)

Set SPAWN_SIZE_VALIDATOR=warn to allow with warning.`;
      return { status: 'block', message };
    } else {
      const message = `⚠️  SPAWN SIZE WARNING: ${sizeKB} KB (${toolCount} tools)
Reason: Exceeds block threshold (${BLOCK_SIZE_KB} KB, ${BLOCK_TOOL_COUNT} tools)`;
      return { status: 'warn', message };
    }
  }

  // Check warn thresholds
  if (sizeKB >= WARN_SIZE_KB || toolCount >= WARN_TOOL_COUNT) {
    const message = `⚠️  SPAWN SIZE WARNING: ${sizeKB} KB (${toolCount} tools)
Reason: Exceeds recommended size threshold (${WARN_SIZE_KB} KB, ${WARN_TOOL_COUNT} tools)`;
    return { status: 'warn', message };
  }

  return { status: 'pass', message: '' };
}

/**
 * Generate pruning suggestions for oversized spawns
 * @param {string[]} toolsArray - Array of tool names
 * @returns {Object} - { suggestions: string[], estimatedSavings: string, example: string }
 */
function generatePruningSuggestions(toolsArray) {
  const suggestions = [];
  let totalSavingsBytes = 0;

  // Priority 1: Remove chrome tools (16 tools ~3200 bytes)
  const chromeTools = toolsArray.filter(
    t => t.startsWith('mcp__chrome-devtools__') || t.startsWith('mcp__claude-in-chrome__')
  );
  if (chromeTools.length > 0) {
    const savingsBytes = chromeTools.length * BYTES_PER_TOOL;
    totalSavingsBytes += savingsBytes;
    suggestions.push(
      `1. Remove chrome tools (${chromeTools.length} tools: mcp__chrome-devtools__*, mcp__claude-in-chrome__*) → Save ~${Math.round((savingsBytes / 1024) * 10) / 10} KB`
    );
  }

  // Priority 2: Remove optional MCP tools (keep core tools only)
  const coreTools = new Set([
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'Task',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'TaskOutput',
    'Skill',
  ]);
  const optionalTools = toolsArray.filter(
    t =>
      !coreTools.has(t) &&
      !chromeTools.includes(t) &&
      (t.startsWith('mcp__') || ['WebSearch', 'WebFetch', 'NotebookEdit'].includes(t))
  );

  if (optionalTools.length > 0) {
    const savingsBytes = optionalTools.length * BYTES_PER_TOOL;
    totalSavingsBytes += savingsBytes;
    suggestions.push(
      `2. Remove optional MCP/web tools (${optionalTools.length} tools: ${optionalTools.slice(0, 3).join(', ')}${optionalTools.length > 3 ? '...' : ''}) → Save ~${Math.round((savingsBytes / 1024) * 10) / 10} KB`
    );
  }

  // Priority 3: Consider splitting spawn
  if (toolsArray.length > 20) {
    suggestions.push('3. Consider splitting into two agents (research + browser automation)');
  }

  const estimatedSavings = `${Math.round((totalSavingsBytes / 1024) * 10) / 10} KB`;

  const example =
    suggestions.length > 0
      ? `\nRecommended tools (core only): ${[...coreTools].slice(0, 10).join(', ')} (<10 tools)`
      : '';

  return { suggestions, estimatedSavings, example };
}

/**
 * Log spawn size to audit file (optional)
 * @param {Object} sizeInfo - Size calculation result
 * @param {string} subagentType - Agent type
 * @param {string} status - Validation status
 */
function logSpawnAudit(sizeInfo, subagentType, status) {
  if (!process.env.SPAWN_SIZE_AUDIT_LOG) return;

  try {
    const auditPath = path.join(PROJECT_ROOT, '.claude', 'context', 'spawn-size-audit.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      agent: subagentType,
      sizeKB: sizeInfo.totalKB,
      toolCount: sizeInfo.toolCount,
      status,
      breakdown: sizeInfo.breakdown,
    };
    fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
  } catch (_err) {
    // Audit logging is optional - don't fail the hook
  }
}

/**
 * Main hook execution
 */
function main() {
  const hookInput = parseHookInputSync();

  // Extract spawn parameters
  const subagentType = hookInput?.subagent_type || hookInput?.description || '';
  const allowedTools = hookInput?.allowed_tools || [];
  const prompt = hookInput?.prompt || '';

  // Check if orchestrator (bypass validation)
  if (ORCHESTRATOR_TYPES.includes(subagentType)) {
    // Orchestrators need complex reasoning and more tools
    process.exit(0);
  }

  // Get validation mode
  const mode = process.env.SPAWN_SIZE_VALIDATOR || 'warn';

  // Calculate size (no template in hook input, estimate from prompt)
  const sizeInfo = calculateSpawnSize(allowedTools, prompt, '');

  // Validate size
  const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, mode);

  // Log to audit file if enabled
  logSpawnAudit(sizeInfo, subagentType, validation.status);

  // If blocked, exit with error
  if (validation.status === 'block') {
    console.error(validation.message);

    // Add pruning suggestions
    if (sizeInfo.toolCount > WARN_TOOL_COUNT || sizeInfo.totalKB > WARN_SIZE_KB) {
      const pruning = generatePruningSuggestions(allowedTools);
      if (pruning.suggestions.length > 0) {
        console.error('\nPRUNING SUGGESTIONS (Priority Order):');
        pruning.suggestions.forEach(s => console.error(s));
        console.error(`\nEstimated savings: ${pruning.estimatedSavings}`);
        if (pruning.example) {
          console.error(pruning.example);
        }
      }
    }

    console.error('\nMore info: .claude/docs/MEMORY_MANAGEMENT.md');
    process.exit(1);
  }

  // If warning, print but allow
  if (validation.status === 'warn') {
    console.warn(validation.message);

    // Add pruning suggestions
    const pruning = generatePruningSuggestions(allowedTools);
    if (pruning.suggestions.length > 0) {
      console.warn('\nPRUNING SUGGESTIONS (Priority Order):');
      pruning.suggestions.forEach(s => console.warn(s));
      console.warn(`\nEstimated savings: ${pruning.estimatedSavings}`);
      if (pruning.example) {
        console.warn(pruning.example);
      }
    }

    console.warn(
      `\nCurrent tools: ${allowedTools.slice(0, 5).join(', ')}${allowedTools.length > 5 ? '...' : ''} (${sizeInfo.toolCount} tools)`
    );
    console.warn(`More info: .claude/docs/MEMORY_MANAGEMENT.md\n`);
  }

  // Allow spawn
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  calculateSpawnSize,
  validateSpawnSize,
  generatePruningSuggestions,
  logSpawnAudit,
  main,
};
