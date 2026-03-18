#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

// G6: MCP Allowlist Checker
const {
  isToolAllowed,
  registerMcpAllowlist,
  DEFAULT_ALLOWLISTS,
  ALLOWLIST_FILE,
} = require('../../.claude/lib/routing/mcp-allowlist-checker.cjs');

// E7: Session Handoff Builder
const {
  buildHandoff,
  formatHandoffMarkdown,
} = require('../../.claude/lib/orchestration/session-handoff-builder.cjs');

describe('G6: MCP Allowlist Checker', () => {
  afterEach(() => {
    try {
      fs.unlinkSync(ALLOWLIST_FILE);
    } catch {
      // ignore
    }
  });

  it('router is denied all MCP servers', () => {
    const result = isToolAllowed('router', 'filesystem');
    assert.equal(result.allowed, false);
  });

  it('developer is allowed filesystem', () => {
    const result = isToolAllowed('developer', 'filesystem');
    assert.equal(result.allowed, true);
  });

  it('researcher is denied chrome-devtools', () => {
    const result = isToolAllowed('researcher', 'chrome-devtools');
    assert.equal(result.allowed, false);
  });

  it('security-architect restricted to specific filesystem tools', () => {
    const allowed = isToolAllowed('security-architect', 'filesystem', 'read_text_file');
    assert.equal(allowed.allowed, true);

    const denied = isToolAllowed('security-architect', 'filesystem', 'write_file');
    assert.equal(denied.allowed, false);
  });

  it('unknown agents get permissive defaults', () => {
    const result = isToolAllowed('random-agent', 'filesystem');
    assert.equal(result.allowed, true);
  });

  it('custom registration overrides defaults', () => {
    registerMcpAllowlist({
      agent_id: 'custom-agent',
      mcp_servers: [{ name: 'Exa', tools_allowed: ['web_search_exa'] }],
      mcp_deny: ['filesystem'],
    });
    assert.equal(isToolAllowed('custom-agent', 'filesystem').allowed, false);
    assert.equal(isToolAllowed('custom-agent', 'Exa', 'web_search_exa').allowed, true);
    assert.equal(isToolAllowed('custom-agent', 'Exa', 'get_code_context_exa').allowed, false);
  });

  it('has default allowlists for 5 core agents', () => {
    assert.ok(Object.keys(DEFAULT_ALLOWLISTS).length >= 5);
  });
});

describe('E7: Session Handoff Builder', () => {
  it('builds a valid handoff object', () => {
    const handoff = buildHandoff({
      nextAction: { description: 'Continue batch 8 implementation' },
      context: {
        completed_tasks: ['B2', 'C7', 'B7'],
        pending_tasks: ['G6', 'E7'],
        key_decisions: ['Direct implementation over agent spawning'],
      },
      continueHere: {
        batch_progress: '18/20 features done',
        critical_notes: ['Max 3 features per agent', 'Agents fail with "Prompt is too long"'],
      },
    });

    assert.ok(handoff.handoff_id.startsWith('handoff-'));
    assert.equal(handoff.next_action.description, 'Continue batch 8 implementation');
    assert.equal(handoff.context.completed_tasks.length, 3);
    assert.equal(handoff.continue_here.batch_progress, '18/20 features done');
  });

  it('formats handoff as markdown', () => {
    const handoff = buildHandoff({
      nextAction: { description: 'Run tests', command: 'pnpm test' },
      context: {
        completed_tasks: ['feat-1'],
        key_decisions: ['Use JWT'],
        dirty_files: ['src/auth.js'],
      },
      continueHere: {
        batch_progress: '5/10',
        critical_notes: ['Do not spawn agents'],
      },
      alternatives: [
        { description: 'Start fresh session', command: 'claude' },
      ],
    });

    const md = formatHandoffMarkdown(handoff);
    assert.ok(md.includes('NEXT ACTION'));
    assert.ok(md.includes('Run tests'));
    assert.ok(md.includes('pnpm test'));
    assert.ok(md.includes('5/10'));
    assert.ok(md.includes('Do not spawn agents'));
    assert.ok(md.includes('Use JWT'));
    assert.ok(md.includes('Start fresh session'));
  });

  it('handles minimal handoff', () => {
    const handoff = buildHandoff({
      nextAction: { description: 'Continue' },
    });
    assert.ok(handoff.timestamp);
    assert.equal(handoff.context.completed_tasks.length, 0);
    assert.equal(handoff.alternatives.length, 0);
  });

  it('includes all required schema fields', () => {
    const handoff = buildHandoff({
      nextAction: { description: 'test' },
    });
    assert.ok('handoff_id' in handoff);
    assert.ok('timestamp' in handoff);
    assert.ok('next_action' in handoff);
    assert.ok('context' in handoff);
  });
});
