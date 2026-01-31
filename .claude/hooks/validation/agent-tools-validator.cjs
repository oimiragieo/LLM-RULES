#!/usr/bin/env node
/**
 * Agent Tools Validator Hook
 *
 * Validates agent tool definitions against approved tools list.
 * Triggers: PreFileWrite on agent files
 *
 * Enforcement modes:
 * - block: Prevent invalid writes (production)
 * - warn: Log warnings (default)
 * - off: Disable validation
 *
 * Environment: AGENT_TOOLS_VALIDATOR=block|warn|off
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Load schema
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/agent-tools.json');
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Extract approved tools from schema
const CORE_TOOLS = new Set(schema.definitions.coreTools.enum);
const APPROVED_MCP_TOOLS = new Set(schema.definitions.approvedMcpTools.enum);
const LEGACY_TOOLS = new Set(schema.definitions.legacyDeprecatedTools.enum);
const MCP_PATTERN = new RegExp(schema.definitions.mcpToolPattern.pattern);

// Agent-specific rules
const AGENT_RULES = {
  orchestrator: {
    requiredTools: ['Task'],
    reason: 'Orchestrators MUST have Task tool for spawning subagents',
  },
  'code-reviewer': {
    forbiddenTools: ['Write', 'Edit'],
    reason: 'Code reviewers are read-only and must not modify files',
  },
  researcher: {
    forbiddenTools: ['Write', 'Edit'],
    reason: 'Researchers are read-only and must not modify files',
  },
  router: {
    allowedTools: [
      'Read',
      'Task',
      'TaskList',
      'TaskCreate',
      'TaskUpdate',
      'TaskGet',
      'AskUserQuestion',
      'Bash',
      'Skill',
    ],
    reason:
      'Router has restricted toolset per CLAUDE.md Section 1.1 (Bash limited to read-only git, Skill for agent/skill creation)',
  },
};

// Category-specific requirements
const CATEGORY_REQUIREMENTS = {
  core: {
    requiredTools: ['TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'],
    reason: 'Core agents must have task tracking tools',
  },
  domain: {
    requiredTools: ['TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'],
    reason: 'Domain agents must have task tracking tools',
  },
  orchestrator: {
    requiredTools: ['Task', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'],
    reason: 'Orchestrators must have Task tool and task tracking',
  },
};

/**
 * Extract frontmatter from agent markdown file
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  try {
    return yaml.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

/**
 * Validate tool against approved lists
 */
function isApprovedTool(tool) {
  // Check core tools
  if (CORE_TOOLS.has(tool)) {
    return { valid: true, type: 'core' };
  }

  // Check legacy/deprecated tools (allowed but warn)
  if (LEGACY_TOOLS.has(tool)) {
    return { valid: true, type: 'legacy', deprecated: true };
  }

  // Check approved MCP tools (including wildcards)
  if (APPROVED_MCP_TOOLS.has(tool)) {
    return { valid: true, type: 'mcp', configured: false };
  }

  // Check if tool matches wildcard pattern (e.g., mcp__filesystem__*)
  for (const approvedTool of APPROVED_MCP_TOOLS) {
    if (approvedTool.endsWith('__*')) {
      const prefix = approvedTool.slice(0, -1); // Remove trailing *
      if (tool.startsWith(prefix)) {
        return { valid: true, type: 'mcp-wildcard', configured: false };
      }
    }
  }

  // Check MCP pattern
  if (MCP_PATTERN.test(tool)) {
    return { valid: true, type: 'mcp-pattern', configured: false };
  }

  return { valid: false, type: 'unknown' };
}

/**
 * Validate agent tools
 */
function validateAgentTools(filePath, content) {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    return {
      valid: false,
      errors: ['No frontmatter found in agent file'],
      warnings: [],
    };
  }

  if (!frontmatter.tools || !Array.isArray(frontmatter.tools)) {
    return {
      valid: false,
      errors: ['No tools array found in frontmatter'],
      warnings: [],
    };
  }

  const tools = frontmatter.tools;
  // Extract category from file path if not in frontmatter
  let category = frontmatter.category;
  if (!category) {
    if (filePath.includes('/core/')) category = 'core';
    else if (filePath.includes('/domain/')) category = 'domain';
    else if (filePath.includes('/specialized/')) category = 'specialized';
    else if (filePath.includes('/orchestrators/')) category = 'orchestrator';
    else category = 'unknown';
  }
  const agentName = path.basename(filePath, '.md');

  const errors = [];
  const warnings = [];

  // Validate tool count
  if (tools.length < 3) {
    errors.push(`Minimum 3 tools required (found ${tools.length})`);
  }
  if (tools.length > 30) {
    errors.push(`Maximum 30 tools allowed (found ${tools.length})`);
  }

  // Validate each tool
  const invalidTools = [];
  const mcpTools = [];
  const legacyTools = [];

  for (const tool of tools) {
    const validation = isApprovedTool(tool);

    if (!validation.valid) {
      invalidTools.push(tool);
    } else if (validation.type === 'legacy') {
      legacyTools.push(tool);
      warnings.push(
        `Legacy/deprecated tool "${tool}" should be replaced (Search->Grep, Git->Bash, SequentialThinking->Skill, MCP Tools->specific tools)`
      );
    } else if (validation.type.startsWith('mcp')) {
      mcpTools.push(tool);
      if (!validation.configured) {
        warnings.push(`MCP tool "${tool}" requires server configuration in settings.json`);
      }
    }
  }

  if (invalidTools.length > 0) {
    errors.push(`Invalid tools: ${invalidTools.join(', ')}`);
    errors.push(`Valid core tools: ${Array.from(CORE_TOOLS).join(', ')}`);
  }

  // Check agent-specific rules
  const agentRule = AGENT_RULES[agentName];
  if (agentRule) {
    if (agentRule.requiredTools) {
      const missing = agentRule.requiredTools.filter(t => !tools.includes(t));
      if (missing.length > 0) {
        errors.push(
          `${agentName}: Missing required tools: ${missing.join(', ')} (${agentRule.reason})`
        );
      }
    }

    if (agentRule.forbiddenTools) {
      const forbidden = agentRule.forbiddenTools.filter(t => tools.includes(t));
      if (forbidden.length > 0) {
        errors.push(`${agentName}: Forbidden tools: ${forbidden.join(', ')} (${agentRule.reason})`);
      }
    }

    if (agentRule.allowedTools) {
      const disallowed = tools.filter(t => !agentRule.allowedTools.includes(t));
      if (disallowed.length > 0) {
        errors.push(
          `${agentName}: Disallowed tools: ${disallowed.join(', ')} (${agentRule.reason})`
        );
      }
    }
  }

  // Check category requirements
  const categoryReq = CATEGORY_REQUIREMENTS[category];
  if (categoryReq) {
    const missing = categoryReq.requiredTools.filter(t => !tools.includes(t));
    if (missing.length > 0) {
      errors.push(
        `Category "${category}": Missing required tools: ${missing.join(', ')} (${categoryReq.reason})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      agentName,
      category,
      toolCount: tools.length,
      mcpToolCount: mcpTools.length,
      legacyToolCount: legacyTools.length,
    },
  };
}

/**
 * Hook handler
 */
async function handler(input) {
  const mode = process.env.AGENT_TOOLS_VALIDATOR || 'warn';

  if (mode === 'off') {
    return { decision: 'allow' };
  }

  const { filePath, content } = input;

  // Only validate agent files (skip README.md)
  if (
    !filePath.includes('.claude/agents/') ||
    !filePath.endsWith('.md') ||
    filePath.endsWith('README.md')
  ) {
    return { decision: 'allow' };
  }

  const result = validateAgentTools(filePath, content);

  if (!result.valid) {
    const errorMsg = [
      `Agent tools validation failed for ${path.basename(filePath)}:`,
      ...result.errors.map(e => `  ❌ ${e}`),
      '',
      'To fix:',
      '  1. Use only approved tools from .claude/schemas/agent-tools.json',
      '  2. Ensure category-specific requirements are met',
      '  3. Check agent-specific rules (orchestrators, reviewers, etc.)',
      '',
      `Enforcement mode: ${mode} (set AGENT_TOOLS_VALIDATOR=warn to allow with warnings)`,
    ].join('\n');

    if (mode === 'block') {
      return {
        decision: 'deny',
        reason: errorMsg,
        metadata: result.metadata,
      };
    } else {
      console.warn(errorMsg);
    }
  }

  // Show warnings even if valid
  if (result.warnings.length > 0) {
    console.warn(
      [
        `Agent tools warnings for ${path.basename(filePath)}:`,
        ...result.warnings.map(w => `  ⚠️  ${w}`),
      ].join('\n')
    );
  }

  return {
    decision: 'allow',
    metadata: result.metadata,
  };
}

/**
 * Hook metadata
 */
const metadata = {
  name: 'agent-tools-validator',
  version: '1.0.0',
  description: 'Validates agent tool definitions against approved tools list',
  triggers: ['PreFileWrite'],
  enforcement: {
    modes: ['block', 'warn', 'off'],
    default: 'warn',
    env: 'AGENT_TOOLS_VALIDATOR',
  },
  dependencies: ['.claude/schemas/agent-tools.json'],
};

module.exports = {
  handler,
  metadata,
  // Export for testing
  _test: {
    extractFrontmatter,
    isApprovedTool,
    validateAgentTools,
  },
};

// CLI mode for testing
if (require.main === module) {
  const filePath = process.argv[2];
  const content = fs.readFileSync(filePath, 'utf8');

  const result = validateAgentTools(filePath, content);

  console.log(JSON.stringify(result, null, 2));

  process.exit(result.valid ? 0 : 1);
}
