'use strict';
// <!-- Agent: security-architect | Task: #S3-aip-tokens | Session: 2026-04-20 -->

/**
 * aip-token-injector.cjs — PreToolUse(Task) hook
 *
 * AIP Invocation-Bound Capability Token Injector
 * Per arXiv 2603.24775 — auto-injects a capability token into every Task() spawn.
 *
 * Behaviour:
 * - Reads the Task() input to extract subagent_type (delegatee)
 * - Infers capabilities from subagent_type via the manifest capability map
 * - Issues a token signed with the AIP signing key
 * - Injects the token as tool_input._aip_token (read by the validator hook)
 * - Escape hatch: AIP_TOKENS=off → pass-through with no token injection
 * - Fail-open: any error → allow the Task() to proceed (advisory injection)
 *
 * Security posture: ADVISORY (fail-open)
 * The injector must not block spawns on its own failure. The validator
 * (aip-token-validator.cjs) is the enforcement point.
 */

const { issueToken } = require('../../lib/aip/capability-tokens.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Capability map: subagent_type → default tool capabilities
// Based on CLAUDE.md agent roles and minimal-privilege principle.
// ---------------------------------------------------------------------------

const DEFAULT_CAPABILITIES = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Task',
  'TaskUpdate',
  'TaskCreate',
  'TaskList',
  'TaskGet',
];

const AGENT_CAPABILITY_MAP = {
  // Core agents
  router: [
    'Task',
    'TaskList',
    'TaskCreate',
    'TaskUpdate',
    'TaskGet',
    'Read',
    'AskUserQuestion',
    'Bash',
  ],
  planner: [...DEFAULT_CAPABILITIES, 'Glob', 'Grep', 'WebSearch'],
  architect: [...DEFAULT_CAPABILITIES, 'Glob', 'Grep', 'WebSearch'],
  developer: DEFAULT_CAPABILITIES,
  qa: [...DEFAULT_CAPABILITIES, 'Glob', 'Grep'],
  'code-reviewer': ['Read', 'Glob', 'Grep', 'TaskUpdate'],
  'code-simplifier': DEFAULT_CAPABILITIES,
  'technical-writer': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  researcher: ['Read', 'WebSearch', 'WebFetch', 'Glob', 'Grep', 'TaskUpdate'],
  'security-architect': [...DEFAULT_CAPABILITIES, 'Glob', 'Grep', 'WebSearch'],
  'memory-manager': ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate'],
  'master-orchestrator': [...DEFAULT_CAPABILITIES, 'Glob', 'Grep'],
  'artifact-integrator': DEFAULT_CAPABILITIES,
  devops: [...DEFAULT_CAPABILITIES, 'Glob', 'Grep'],
};

const WILDCARD_AGENTS = new Set(['master-orchestrator', 'evolution-orchestrator', 'router']);

// Default TTL: 1 hour (3600s). Override via AIP_TOKEN_TTL env var.
const TOKEN_TTL = parseInt(process.env.AIP_TOKEN_TTL || '3600', 10) || 3600;

// Source agent identity: use CLAUDE_AGENT_ID if set (for worktree agents),
// otherwise default to 'router' (the primary spawner).
const SOURCE_AGENT = process.env.CLAUDE_AGENT_ID || 'router';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = safeParseJSON(Buffer.concat(chunks).toString());
    const toolName = input?.tool_name || '';

    // Only process Task() calls
    if (toolName !== 'Task') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Escape hatch: AIP_TOKENS=off → pass-through
    if ((process.env.AIP_TOKENS || '').toLowerCase() === 'off') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const subagentType = input?.tool_input?.subagent_type || 'developer';

    // Determine capability scope for this delegatee
    let capabilities;
    if (WILDCARD_AGENTS.has(subagentType)) {
      capabilities = ['*'];
    } else {
      capabilities = AGENT_CAPABILITY_MAP[subagentType] || DEFAULT_CAPABILITIES;
    }

    // Issue the token
    const token = issueToken(SOURCE_AGENT, subagentType, capabilities, TOKEN_TTL);

    // Inject token into the tool_input (advisory: always allow)
    process.stdout.write(
      JSON.stringify({
        allow: true,
        tool_input_override: {
          ...input.tool_input,
          _aip_token: token,
          _aip_src: SOURCE_AGENT,
        },
      })
    );
    process.exit(0);
  } catch (err) {
    // Fail-open: log error to stderr, allow Task() to proceed
    process.stderr.write(`[aip-token-injector] ERROR: ${err.message} — failing open\n`);
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  }
});
