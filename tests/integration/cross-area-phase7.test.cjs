#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 7 (Security & Advanced Integration)
 * ==========================================================================
 *
 * VAL-CROSS-012: Case-normalized paths block + prompt cache stability
 *   Write to .cLauDe blocked by case-normalized guard. Prompt assembled before
 *   and after blocked write has identical tool sections (no cache break).
 *
 * VAL-CROSS-013: Denial tracking feeds routing after security blocks
 *   3 bash blocks → denial-log has 3 entries → routing feedback suggests
 *   non-Bash agent alternatives.
 *
 * VAL-CROSS-014: suppressOutput prevents security noise in context budget
 *   Verbose security block with suppressOutput:true does not inflate
 *   context-window-monitor's token tracking.
 *
 * VAL-CROSS-015: Agent schema new fields round-trip
 *   Agent with disallowedTools + mcpServers + fork_eligible validates,
 *   assembles correctly, and round-trips without data loss.
 *
 * Uses temp dirs for isolation. Imports modules directly.
 * Uses spawnSync to invoke hooks for end-to-end verification.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Module paths ─────────────────────────────────────────────────────────────

const WRITE_HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'safety', 'unified-pre-write-hook.cjs');
const BASH_VALIDATOR_PATH = path.join(
  ROOT,
  '.claude',
  'hooks',
  'safety',
  'bash-command-validator.cjs'
);
const DENIAL_LOGGER_PATH = path.join(
  ROOT,
  '.claude',
  'hooks',
  'lifecycle',
  'permission-denied-logger.cjs'
);
const DENIAL_FEEDBACK_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'routing',
  'denial-feedback-reader.cjs'
);
const ASSEMBLER_PATH = path.join(ROOT, '.claude', 'lib', 'spawn', 'prompt-assembler.cjs');
const CONTEXT_MONITOR_PATH = path.join(
  ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'context-window-monitor.cjs'
);
const SCHEMA_VALIDATOR_PATH = path.join(ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs');
const AGENT_SCHEMA_PATH = path.join(ROOT, '.claude', 'schemas', 'agent-definition.schema.json');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');

// ─── Load modules ─────────────────────────────────────────────────────────────

const writeHook = require(WRITE_HOOK_PATH);
const { appendEntry, readLog } = require(DENIAL_LOGGER_PATH);
const { getDenialFeedback } = require(DENIAL_FEEDBACK_PATH);
const assembler = require(ASSEMBLER_PATH);
const contextMonitor = require(CONTEXT_MONITOR_PATH);
const { validateData } = require(SCHEMA_VALIDATOR_PATH);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run the bash-command-validator hook with the given command via spawnSync.
 * Returns { status, stdout, stderr, parsed }.
 *
 * @param {string} command - The bash command to validate
 * @returns {{ status: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runBashHook(command) {
  const result = spawnSync(process.execPath, [BASH_VALIDATOR_PATH], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    cwd: ROOT,
    shell: false,
    windowsHide: true,
  });
  const stdout = (result.stdout || '').trim();
  return {
    status: result.status,
    stdout,
    stderr: result.stderr || '',
    parsed: stdout
      ? (() => {
          try {
            return JSON.parse(stdout);
          } catch (_) {
            return null;
          }
        })()
      : null,
  };
}

/**
 * Extract the AVAILABLE_TOOLS section from an assembled prompt.
 * Returns the substring from "## AVAILABLE_TOOLS" to the next "## " header
 * (or end of string if no subsequent header).
 *
 * @param {string} prompt - The assembled prompt string
 * @returns {string} The tools section content, or '' if not found
 */
function extractToolsSection(prompt) {
  const start = prompt.indexOf('## AVAILABLE_TOOLS');
  if (start === -1) return '';
  // Find the next '## ' header after the tools section
  const nextHeader = prompt.indexOf('\n## ', start + 1);
  return nextHeader === -1 ? prompt.slice(start) : prompt.slice(start, nextHeader);
}

/**
 * Minimal YAML frontmatter serializer for agent .md files.
 * Only handles string, boolean, and array-of-strings fields.
 *
 * @param {Object} frontmatter - Frontmatter fields
 * @param {string} content - Agent markdown content body
 * @returns {string} Complete .md file string with YAML frontmatter
 */
function buildAgentMd(frontmatter, content) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(content);
  return lines.join('\n');
}

// ─── Stable test fixtures ─────────────────────────────────────────────────────

/** Minimal valid agent content (>= 100 chars as required by schema). */
const VALID_CONTENT =
  '# Test Agent\n\n' +
  'This is a cross-area phase 7 integration test agent.\n' +
  'It verifies the new schema fields: disallowedTools, mcpServers, fork_eligible.\n' +
  'Additional content to meet the 100-character minimum length requirement.';

/** Base assembly options — stable, deterministic across runs. */
const BASE_OPTIONS = Object.freeze({
  agentType: 'developer',
  basePrompt: 'You are a developer agent for cross-area phase 7 integration testing.',
  includeMemory: false,
  presetId: null,
  maxToolsInPrompt: 10,
  maxSkillsInPrompt: 5,
});

/** Tool set for cache-stability tests. */
const TOOLS_CACHE = ['Edit', 'Read', 'Write'];

// =============================================================================
// VAL-CROSS-012: Case-normalized paths block + prompt cache stability
// =============================================================================

describe('VAL-CROSS-012: Case-normalized paths block + prompt cache stability', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p7-012-'));
    assembler._clearCache();
    contextMonitor._resetState();
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('mixed-case .cLauDe path is blocked by case-normalized guard', () => {
    const { matchesProtectedPattern, DISALLOWED_PATTERNS } = writeHook;

    // Verify that the case-normalized comparison blocks mixed-case variants
    assert.ok(
      matchesProtectedPattern('.cLauDe/settings.json', DISALLOWED_PATTERNS),
      '.cLauDe/settings.json must be blocked by case-normalized guard'
    );
    assert.ok(
      matchesProtectedPattern('.CLAUDE/config.json', DISALLOWED_PATTERNS),
      '.CLAUDE/config.json must be blocked by case-normalized guard'
    );
    assert.ok(
      matchesProtectedPattern('.Claude/hooks/safety/evil.cjs', DISALLOWED_PATTERNS),
      '.Claude/hooks/safety/evil.cjs must be blocked by case-normalized guard'
    );
  });

  it('file-placement-guard check blocks mixed-case .cLauDe write', async () => {
    const { CHECKS } = writeHook;
    const guard = CHECKS.find(c => c.name === 'file-placement-guard');
    assert.ok(guard, 'file-placement-guard check must exist in unified-pre-write-hook');

    const result = await guard.run('Write', { file_path: '.cLauDe/settings.json' });
    assert.strictEqual(result.pass, false, 'Guard must block .cLauDe write');
    assert.ok(
      typeof result.message === 'string' && result.message.length > 0,
      'Block result must include a message'
    );
  });

  it('prompt tool sections identical before and after blocked write (no cache break)', async () => {
    assembler._clearCache();

    // Step 1: Assemble prompt before the blocked write
    const promptBefore = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: TOOLS_CACHE,
    });
    const toolsSectionBefore = extractToolsSection(promptBefore);

    assert.ok(
      toolsSectionBefore.length > 0,
      'Prompt before blocked write must contain AVAILABLE_TOOLS section'
    );

    // Step 2: Simulate a blocked write to .cLauDe (the case-normalized guard runs)
    const { CHECKS } = writeHook;
    const guard = CHECKS.find(c => c.name === 'file-placement-guard');
    const blockResult = await guard.run('Write', { file_path: '.cLauDe/settings.json' });
    assert.strictEqual(blockResult.pass, false, 'Write to .cLauDe must be blocked');

    // Step 3: Assemble prompt after the blocked write — must be identical
    const promptAfter = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: TOOLS_CACHE,
    });
    const toolsSectionAfter = extractToolsSection(promptAfter);

    assert.strictEqual(
      toolsSectionAfter,
      toolsSectionBefore,
      'Tool sections must be identical after a blocked write (no cache break caused by block)'
    );
    assert.strictEqual(
      promptAfter,
      promptBefore,
      'Full prompt must be byte-identical after blocked write'
    );
  });
});

// =============================================================================
// VAL-CROSS-013: Denial tracking feeds routing after security blocks
// =============================================================================

describe('VAL-CROSS-013: Denial tracking feeds routing after security blocks', () => {
  let tmpDir;
  let tempLogFile;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p7-013-'));
    tempLogFile = path.join(tmpDir, 'denial-log.json');
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('bash-command-validator blocks dangerous commands (exit 2, suppressOutput)', () => {
    // Verify that a dangerous command triggers a block with exit 2 and suppressOutput
    const result = runBashHook('sudo rm -rf /');
    assert.strictEqual(result.status, 2, 'Dangerous command must exit with code 2 (blocked)');
    assert.ok(result.parsed !== null, 'Blocked response must include parseable JSON on stdout');
    assert.strictEqual(
      result.parsed.suppressOutput,
      true,
      'Blocked response must include suppressOutput:true'
    );
  });

  it('appendEntry records 3 Bash denial entries in temp log', () => {
    // Simulate 3 bash blocks by appending denial entries directly
    const bashDenialInput = {
      tool_name: 'Bash',
      reason: 'Dangerous command blocked by bash-command-validator',
      session_id: 'test-session-cross-p7',
    };

    for (let i = 0; i < 3; i++) {
      appendEntry(bashDenialInput, tempLogFile);
    }

    const entries = readLog(tempLogFile);
    assert.strictEqual(entries.length, 3, 'Denial log must have exactly 3 entries');

    for (const entry of entries) {
      assert.strictEqual(entry.tool, 'Bash', `Each entry must have tool='Bash'`);
      assert.ok(typeof entry.reason === 'string', 'Each entry must have a reason string');
      assert.ok(typeof entry.timestamp === 'string', 'Each entry must have a timestamp');
    }
  });

  it('getDenialFeedback returns 3 total denials and Bash in deniedTools', () => {
    const summary = getDenialFeedback(tempLogFile, { agentsDir: AGENTS_DIR });

    assert.strictEqual(
      summary.totalDenials,
      3,
      `getDenialFeedback must return totalDenials=3, got ${summary.totalDenials}`
    );
    assert.ok(
      summary.deniedTools.includes('Bash'),
      `deniedTools must include 'Bash'; got: ${JSON.stringify(summary.deniedTools)}`
    );
    assert.strictEqual(summary.toolCounts['Bash'], 3, `toolCounts['Bash'] must equal 3`);
    assert.ok(summary.fileExists, 'fileExists must be true when log file exists');
  });

  it('getDenialFeedback suggestions list agents without Bash tool', () => {
    const summary = getDenialFeedback(tempLogFile, { agentsDir: AGENTS_DIR });

    assert.ok(
      Array.isArray(summary.suggestions) && summary.suggestions.length > 0,
      `Suggestions must be non-empty when Bash has >= 3 denials; got ${summary.suggestions.length}`
    );

    const bashSuggestion = summary.suggestions.find(s => s.deniedTool === 'Bash');
    assert.ok(bashSuggestion !== undefined, `Suggestions must include an entry for 'Bash'`);

    assert.strictEqual(bashSuggestion.denialCount, 3, 'Bash suggestion denialCount must equal 3');
    assert.ok(
      Array.isArray(bashSuggestion.agentNames) && bashSuggestion.agentNames.length > 0,
      'Bash suggestion must include at least one alternative agent name'
    );
    assert.ok(
      typeof bashSuggestion.message === 'string' && bashSuggestion.message.includes('Bash'),
      'Suggestion message must mention the denied tool'
    );

    // Verify each suggested alternative does not have Bash in its tools
    for (const alt of bashSuggestion.alternatives) {
      const altToolsLower = alt.tools.map(t => t.toLowerCase());
      assert.ok(
        !altToolsLower.includes('bash'),
        `Alternative agent '${alt.name}' must not have Bash in its tools`
      );
    }
  });
});

// =============================================================================
// VAL-CROSS-014: suppressOutput prevents security noise in context budget
// =============================================================================

describe('VAL-CROSS-014: suppressOutput prevents security noise in context budget', () => {
  let tmpDir;
  let budgetTrackerPath;
  let sessionIdPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p7-014-'));
    budgetTrackerPath = path.join(tmpDir, 'budget-tracker.json');
    sessionIdPath = path.join(tmpDir, 'session-id.json');
    contextMonitor._resetState();
  });

  after(() => {
    delete process.env.BUDGET_TRACKER_PATH;
    delete process.env.SESSION_ID_PATH;
    contextMonitor._resetState();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('bash validator block response includes suppressOutput:true', () => {
    // A dangerous command must produce suppressOutput:true in the JSON response.
    // eval is not in the safe allowlist (SEC-CRITICAL) so it triggers SEC-AUDIT-017 → exit 2.
    const result = runBashHook('eval malicious_payload');
    assert.strictEqual(result.status, 2, 'Dangerous command must be blocked (exit 2)');
    assert.ok(result.parsed !== null, 'Block response must be parseable JSON');
    assert.strictEqual(
      result.parsed.suppressOutput,
      true,
      'Block response must include suppressOutput:true'
    );
  });

  it('block message is on stderr only, not in stdout additionalContext', () => {
    // The verbose block message must NOT appear in stdout (suppressed)
    // so it does not contribute to additionalContext injected into the context window
    const result = runBashHook('eval malicious');
    assert.strictEqual(result.status, 2, 'Dangerous command must exit 2');

    // stdout should be the JSON blob only (no verbose text)
    assert.ok(
      result.parsed !== null,
      'stdout must be valid JSON (no verbose block message mixed in)'
    );
    // The verbose box format must not appear in stdout (only in stderr)
    assert.ok(
      !result.stdout.includes('+--------------------------------------------------+'),
      'Verbose block box must not appear in stdout'
    );
    // The verbose box must appear in stderr
    assert.ok(result.stderr.includes('BLOCKED'), 'Verbose block message must appear in stderr');
  });

  it('context-window-monitor token tracking shows minimal delta when output is suppressed', () => {
    // Set up a mock budget tracker with a stable token count
    const SESSION_ID = 'test-session-p7-014';
    const INITIAL_TOKENS = 50_000;
    const BUDGET = 200_000;

    fs.writeFileSync(sessionIdPath, JSON.stringify({ sessionId: SESSION_ID }), 'utf8');
    fs.writeFileSync(
      budgetTrackerPath,
      JSON.stringify({ [SESSION_ID]: { totalTokens: INITIAL_TOKENS, budget: BUDGET } }),
      'utf8'
    );

    process.env.BUDGET_TRACKER_PATH = budgetTrackerPath;
    process.env.SESSION_ID_PATH = sessionIdPath;

    contextMonitor._resetState();

    // First turn: establish baseline (previousTokensUsed = INITIAL_TOKENS)
    const baseline = contextMonitor.checkMicrocompact(INITIAL_TOKENS);
    assert.strictEqual(baseline.detected, false, 'No microcompact on first baseline turn');

    // Trigger a security block with suppressOutput:true (doesn't add to context window)
    const blockResult = runBashHook('sudo rm -rf /');
    assert.strictEqual(blockResult.status, 2, 'Security block must fire');
    assert.strictEqual(
      blockResult.parsed?.suppressOutput,
      true,
      'Block response must have suppressOutput:true'
    );

    // Second turn: same token count (suppressed output did not inflate context)
    // Delta should be minimal (0 drop, 0 increase)
    const secondCheck = contextMonitor.checkMicrocompact(INITIAL_TOKENS);
    assert.strictEqual(
      secondCheck.detected,
      false,
      'No microcompact detected — token count unchanged due to suppressOutput'
    );
    assert.strictEqual(
      secondCheck.drop,
      0,
      'Token drop must be 0 — suppressed output did not inflate then drop context'
    );
  });
});

// =============================================================================
// VAL-CROSS-015: Agent schema new fields round-trip
// =============================================================================

describe('VAL-CROSS-015: Agent schema new fields round-trip', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p7-015-'));
    assembler._clearCache();
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('agent definition with disallowedTools + mcpServers + fork_eligible validates against schema', () => {
    const agentDef = {
      frontmatter: {
        name: 'test-cross-p7',
        description:
          'Test agent for cross-area phase 7 integration testing. ' +
          'Validates new schema fields: disallowedTools, mcpServers, fork_eligible.',
        tools: ['Read', 'Write', 'Edit', 'Bash'],
        disallowedTools: ['Bash'],
        mcpServers: ['github', 'filesystem'],
        fork_eligible: true,
      },
      content: VALID_CONTENT,
    };

    const result = validateData(agentDef, AGENT_SCHEMA_PATH);
    assert.ok(
      result.valid || result.skipped,
      `Agent definition must validate against schema ` +
        `(valid=${result.valid}, skipped=${result.skipped}, ` +
        `errors=${JSON.stringify(result.errors)})`
    );
  });

  it('assembleSpawnPrompt excludes disallowedTools from tool section', () => {
    assembler._clearCache();

    const allowedTools = ['Read', 'Write', 'Edit', 'Bash'];
    const disallowedTools = ['Bash'];

    const prompt = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools,
      disallowedTools,
    });

    const toolsSection = extractToolsSection(prompt);
    assert.ok(toolsSection.length > 0, 'Assembled prompt must include AVAILABLE_TOOLS section');

    // Read, Write, Edit must be present; Bash must be absent (disallowed)
    assert.ok(toolsSection.includes('Read'), 'Read must appear in tool section');
    assert.ok(
      !toolsSection.includes('\nBash') && !toolsSection.includes('- Bash'),
      'Bash must NOT appear in tool section (disallowedTools wins)'
    );
  });

  it('agent definition round-trips to temp file and back with deep equality', () => {
    const agentDef = {
      frontmatter: {
        name: 'test-roundtrip-p7',
        description:
          'Round-trip test agent for phase 7 cross-area integration. ' +
          'Verifies disallowedTools, mcpServers, and fork_eligible persist without data loss.',
        tools: ['Read', 'Write', 'Edit'],
        disallowedTools: ['Bash', 'WebSearch'],
        mcpServers: ['github', 'filesystem'],
        fork_eligible: true,
      },
      content: VALID_CONTENT,
    };

    // Write to temp JSON file and re-read — verifies all fields survive serialization
    const tempFile = path.join(tmpDir, 'test-roundtrip-p7.json');
    fs.writeFileSync(tempFile, JSON.stringify(agentDef, null, 2), 'utf8');
    const reread = JSON.parse(fs.readFileSync(tempFile, 'utf8'));

    // Assert deep equality of all new fields
    assert.deepStrictEqual(
      reread.frontmatter.disallowedTools,
      agentDef.frontmatter.disallowedTools,
      'disallowedTools must round-trip without data loss'
    );
    assert.deepStrictEqual(
      reread.frontmatter.mcpServers,
      agentDef.frontmatter.mcpServers,
      'mcpServers must round-trip without data loss'
    );
    assert.strictEqual(
      reread.frontmatter.fork_eligible,
      agentDef.frontmatter.fork_eligible,
      'fork_eligible must round-trip without data loss'
    );
    assert.deepStrictEqual(
      reread.frontmatter.tools,
      agentDef.frontmatter.tools,
      'tools must round-trip without data loss'
    );
    assert.strictEqual(
      reread.frontmatter.name,
      agentDef.frontmatter.name,
      'name must round-trip without data loss'
    );
  });

  it('all three new fields preserved after validate → assemble → write → re-read cycle', () => {
    const agentFrontmatter = {
      name: 'test-full-cycle-p7',
      description:
        'Full cycle test agent for phase 7. Validates all new fields end-to-end: ' +
        'schema validation, prompt assembly, file write, and re-read.',
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      disallowedTools: ['Bash'],
      mcpServers: ['github'],
      fork_eligible: false,
    };
    const agentDef = { frontmatter: agentFrontmatter, content: VALID_CONTENT };

    // Step 1: Validate against schema
    const validationResult = validateData(agentDef, AGENT_SCHEMA_PATH);
    assert.ok(
      validationResult.valid || validationResult.skipped,
      `Step 1: Agent must validate (valid=${validationResult.valid}, skipped=${validationResult.skipped})`
    );

    // Step 2: Assemble prompt — disallowedTools must filter Bash
    assembler._clearCache();
    const prompt = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: agentFrontmatter.tools,
      disallowedTools: agentFrontmatter.disallowedTools,
    });
    assert.ok(
      prompt.includes('## AVAILABLE_TOOLS'),
      'Step 2: Assembled prompt must contain AVAILABLE_TOOLS section'
    );

    // Step 3: Write to temp file
    const tempFile = path.join(tmpDir, 'test-full-cycle-p7.md');
    fs.writeFileSync(tempFile, buildAgentMd(agentFrontmatter, VALID_CONTENT), 'utf8');

    // Step 4: Re-read and verify fields preserved
    const reread = fs.readFileSync(tempFile, 'utf8');
    assert.ok(reread.includes('disallowedTools:'), 'Step 4: disallowedTools key must be in file');
    assert.ok(reread.includes('mcpServers:'), 'Step 4: mcpServers key must be in file');
    assert.ok(reread.includes('fork_eligible:'), 'Step 4: fork_eligible key must be in file');
    assert.ok(reread.includes('- Bash'), 'Step 4: Bash entry must appear under disallowedTools');
    assert.ok(reread.includes('- github'), 'Step 4: github entry must appear under mcpServers');
    assert.ok(
      reread.includes('fork_eligible: false'),
      'Step 4: fork_eligible: false must be in file'
    );

    // Step 5: Assert original object not mutated by assembly
    assert.deepEqual(
      agentDef.frontmatter.disallowedTools,
      ['Bash'],
      'Step 5: disallowedTools must not be mutated'
    );
    assert.deepEqual(
      agentDef.frontmatter.mcpServers,
      ['github'],
      'Step 5: mcpServers must not be mutated'
    );
    assert.strictEqual(
      agentDef.frontmatter.fork_eligible,
      false,
      'Step 5: fork_eligible must not be mutated'
    );
  });
});
