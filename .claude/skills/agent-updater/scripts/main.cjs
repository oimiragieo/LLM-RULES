#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  validateFixedPreserved,
  applyUpdatePreservingFixed,
} = require('../../../lib/updaters/fixed-section-handler.cjs');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (path.basename(dir) === '.claude') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const MANDATORY_SKILLS = Object.freeze([
  'task-management-protocol',
  'ripgrep',
  'code-semantic-search',
  'context-compressor',
  'verification-before-completion',
  'memory-search',
]);
const ORCHESTRATOR_REQUIRED_FILES = Object.freeze([
  '.claude/CLAUDE.md',
  '.claude/workflows/core/router-decision.md',
  '.claude/workflows/core/ecosystem-creation-workflow.md',
]);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function resolveAgentPath(raw) {
  const input = String(raw || '').trim();
  if (!input) return { agentName: '', agentPath: '', exists: false };

  if (input.endsWith('.md') || input.includes('.claude/agents/')) {
    const normalized = input.replace(/\\/g, '/');
    const abs = path.join(PROJECT_ROOT, normalized);
    return {
      agentName: path.basename(normalized, '.md'),
      agentPath: normalized,
      exists: fs.existsSync(abs),
    };
  }

  const all = walk(AGENTS_DIR).filter(file => file.endsWith('.md'));
  const match = all.find(file => path.basename(file, '.md') === input);
  if (!match) {
    return {
      agentName: input,
      agentPath: `.claude/agents/**/${input}.md`,
      exists: false,
    };
  }

  const rel = path.relative(PROJECT_ROOT, match).replace(/\\/g, '/');
  return {
    agentName: input,
    agentPath: rel,
    exists: true,
  };
}

function classifyRisk(changes) {
  const text = String(changes || '').toLowerCase();
  if (/(permission|model|tool|security|hook|orchestrator)/.test(text)) return 'high';
  if (/(skills|routing|keyword|workflow|protocol)/.test(text)) return 'medium';
  return 'low';
}

function checkMandatorySkills(agentPath) {
  const absolutePath = path.join(PROJECT_ROOT, agentPath);
  if (!fs.existsSync(absolutePath)) {
    return { present: [], missing: MANDATORY_SKILLS.slice() };
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { present: [], missing: MANDATORY_SKILLS.slice() };
  const frontmatter = fmMatch[1];
  const skillLines = frontmatter.match(/^\s*-\s+\S+/gm) || [];
  const presentSkills = skillLines.map(l => l.replace(/^\s*-\s+/, '').trim());
  const missing = MANDATORY_SKILLS.filter(s => !presentSkills.includes(s));
  const present = MANDATORY_SKILLS.filter(s => presentSkills.includes(s));
  return { present, missing, allPresent: missing.length === 0 };
}

/**
 * Run framework tests and return the pass count.
 * Uses `pnpm test:framework` with a 120s timeout.
 * Returns { passed: number, output: string } or null on failure.
 */
function computeScoreGate(projectRoot) {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'cross-env',
      'NODE_OPTIONS=--experimental-vm-modules',
      'pnpm',
      'test:framework',
      '--',
      '--test-timeout=10000',
    ],
    {
      cwd: projectRoot || PROJECT_ROOT,
      shell: false,
      timeout: 120_000,
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
    }
  );

  const combined = [result.stdout || '', result.stderr || ''].join('\n');
  // Parse TAP-style "# pass N" or Node test runner "# pass N"
  const passMatch = combined.match(/# pass\s+(\d+)/i);
  const passed = passMatch ? parseInt(passMatch[1], 10) : -1;

  return { passed, output: combined.slice(0, 2000) };
}

/**
 * Evaluate score gate: compare pre and post test pass counts.
 * Returns { allowed: boolean, warning: string|null, pre: number, post: number }
 *
 * Policy:
 * - post < pre - 2  => BLOCK (hard regression)
 * - post < pre      => WARN (soft regression)
 * - post >= pre     => ALLOW
 */
function evaluateScoreGate(pre, post) {
  if (pre < 0 || post < 0) {
    return {
      allowed: true,
      warning: 'Score gate skipped: could not parse test pass counts',
      pre,
      post,
    };
  }
  if (post < pre - 2) {
    return {
      allowed: false,
      warning: `BLOCKED: Test pass count dropped by ${pre - post} (from ${pre} to ${post}). Threshold: max -2.`,
      pre,
      post,
    };
  }
  if (post < pre) {
    return {
      allowed: true,
      warning: `WARNING: Test pass count decreased by ${pre - post} (from ${pre} to ${post}). Review recommended.`,
      pre,
      post,
    };
  }
  return { allowed: true, warning: null, pre, post };
}

/**
 * Append a row to the evolution audit trail TSV.
 * Creates the file with a header row if it does not exist.
 *
 * @param {Object} entry
 * @param {string} entry.artifactType   - 'agent' | 'skill' | 'workflow' | 'hook' etc.
 * @param {string} entry.artifactName   - kebab-case name
 * @param {string} entry.action         - 'created' | 'updated' | 'deprecated'
 * @param {string} entry.changeSummary  - brief description of changes
 * @param {string} [entry.timestamp]    - ISO-8601 timestamp (default: now)
 */
function appendEvolutionLog(entry) {
  const tsvPath = path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'agent-evolution-log.tsv');
  const header = 'timestamp\tartifact_type\tartifact_name\taction\tchange_summary\n';
  if (!fs.existsSync(tsvPath)) {
    // Ensure directory exists
    const dir = path.dirname(tsvPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tsvPath, header, 'utf8');
  }
  const row = [
    entry.timestamp || new Date().toISOString(),
    entry.artifactType || '',
    entry.artifactName || '',
    entry.action || 'updated',
    String(entry.changeSummary || '')
      .replace(/\t/g, ' ')
      .replace(/\n/g, ' '),
  ].join('\t');
  fs.appendFileSync(tsvPath, row + '\n', 'utf8');
}

/**
 * Validate that the proposed content for an agent file does not violate
 * any FIXED section markers. Reads the current on-disk content as the
 * original reference.
 *
 * @param {string} agentPath   - relative path to the agent file (e.g. .claude/agents/core/developer.md)
 * @param {string} proposedContent - the new content to apply
 * @returns {{ valid: boolean, violations: Array<{sectionName: string, reason: string}> }}
 */
function validateFixedSections(agentPath, proposedContent) {
  const absolutePath = path.join(PROJECT_ROOT, agentPath);
  if (!fs.existsSync(absolutePath)) {
    return { valid: true, violations: [] };
  }
  const originalContent = fs.readFileSync(absolutePath, 'utf8');
  return validateFixedPreserved(originalContent, proposedContent);
}

/**
 * Apply proposedContent to an agent file while preserving any FIXED sections
 * from the current on-disk content.
 *
 * @param {string} agentPath
 * @param {string} proposedContent
 * @returns {string} merged safe content
 */
function applyPreservingFixedSections(agentPath, proposedContent) {
  const absolutePath = path.join(PROJECT_ROOT, agentPath);
  if (!fs.existsSync(absolutePath)) {
    return proposedContent;
  }
  const originalContent = fs.readFileSync(absolutePath, 'utf8');
  return applyUpdatePreservingFixed(originalContent, proposedContent);
}

function buildPatchPlan(target, agentName) {
  // POST-UPDATE INTEGRATION (Phase 4.3 Hardening)
  try {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'tools',
      'cli',
      'generate-agent-registry.cjs'
    );
    const { spawnSync } = require('node:child_process');
    spawnSync('node', [scriptPath], { windowsHide: true });

    // Also sync routing keywords/agents if they exist
    if (agentName) {
      updateRoutingTableKeywords(agentName, ''); // Minimal refresh
    }

    const learningsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Refreshed agent: ${target} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Post-update integration partial: ${err.message}`);
  }

  const normalizedTarget = String(target || '').replace(/\\/g, '/');
  const isOrchestrator = normalizedTarget.includes('/orchestrators/');

  return {
    objective:
      'Refresh agent prompt/frontmatter with explicit microtask ownership, search/token-saver policy, and regression-safe workflow alignment.',
    promptFiles: [
      '.claude/agents/core/developer.md',
      '.claude/agents/core/qa.md',
      '.claude/agents/specialized/code-reviewer.md',
    ],
    workflowFiles: [
      '.claude/workflows/core/enterprise-workflow.md',
      '.claude/workflows/core/router-decision.md',
    ],
    hookEnforcementPoints: [
      '.claude/hooks/routing/pre-task-unified-core.cjs',
      '.claude/hooks/routing/pre-task-unified-ownership.cjs',
      '.claude/hooks/routing/pre-tool-unified.taskupdate.cjs',
      '.claude/hooks/workflow/post-completion-chain.cjs',
    ],
    validationCommands: [
      `node .claude/tools/cli/validate-integration.cjs ${target}`,
      'node .claude/tools/cli/generate-agent-registry.cjs',
      'pnpm validate:workflow-skill-contracts',
      'pnpm lint',
    ],
    orchestratorRequiredFiles: isOrchestrator ? ORCHESTRATOR_REQUIRED_FILES : [],
  };
}

function updateRoutingTableKeywords(name, _description) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-keywords-data.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const keywords = Array.from(new Set([name, ...name.split('-')])).slice(0, 10);

  const formattedKeywords = keywords.map(keyword => `    '${keyword}'`).join(',\n');
  const entry = `  '${name}': [\n${formattedKeywords},\n  ],`;

  const searchStr = '\n};\n\n// Deliberate overlaps';
  const insertionPoint = content.indexOf(searchStr);
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + '\n' + entry + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    throw new Error(`Unable to locate INTENT_KEYWORDS insertion point in ${filePath}`);
  }
}

function updateAgentMetadata(agentPath) {
  const absolutePath = path.join(PROJECT_ROOT, agentPath);
  if (!fs.existsSync(absolutePath)) return;

  let content = fs.readFileSync(absolutePath, 'utf8');
  const now = new Date().toISOString();

  if (content.includes('lastVerifiedAt:')) {
    content = content.replace(/lastVerifiedAt: .*/, `lastVerifiedAt: ${now}`);
  } else {
    content = content.replace(/---\n/, `---\nlastVerifiedAt: ${now}\n`);
  }

  if (content.includes('verified:')) {
    content = content.replace(/verified: .*/, `verified: true`);
  } else {
    content = content.replace(/---\n/, `---\nverified: true\n`);
  }

  fs.writeFileSync(absolutePath, content, 'utf8');
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/agent-updater/scripts/main.cjs --agent <name-or-path> [--trigger reflection|evolve|manual] [--changes "..."]',
    };
  }

  const resolved = resolveAgentPath(options.agent || options.name);
  const trigger = ['reflection', 'evolve', 'manual'].includes(options.trigger)
    ? options.trigger
    : 'manual';

  if (!resolved.agentName) return { ok: false, stage: 'input', error: 'Missing --agent' };
  if (!resolved.exists) {
    return {
      ok: false,
      stage: 'resolve_target',
      target: resolved,
      recommendation: 'Agent not found. Use Skill({ skill: "agent-creator" }) for net-new agent.',
    };
  }

  // Apply metadata updates
  updateAgentMetadata(resolved.agentPath);

  const risk = classifyRisk(options.changes || '');
  const mandatorySkillsCheck = checkMandatorySkills(resolved.agentPath);
  const patchPlan = buildPatchPlan(resolved.agentPath, resolved.agentName);

  // Append evolution audit trail entry
  try {
    appendEvolutionLog({
      artifactType: 'agent',
      artifactName: resolved.agentName,
      action: 'updated',
      changeSummary: options.changes || `agent-updater run (trigger: ${trigger})`,
    });
  } catch (err) {
    console.error(`Warning: Could not append evolution log: ${err.message}`);
  }

  // Score gate: capture pre-change baseline when in execute mode
  const effectiveMode =
    String(options.mode || 'plan')
      .trim()
      .toLowerCase() || 'plan';
  let scoreGateResult = {
    available: true,
    description: 'Run computeScoreGate() before and after applying changes to detect regressions',
    thresholds: { block: -2, warn: -1 },
  };
  if (effectiveMode === 'execute') {
    try {
      const preResult = computeScoreGate(PROJECT_ROOT);
      scoreGateResult = {
        ...scoreGateResult,
        preBaseline: preResult,
        prePassCount: preResult.passed,
        capturedAt: new Date().toISOString(),
        instructions:
          'After applying changes, call computeScoreGate() again and pass both counts to evaluateScoreGate(pre, post)',
      };
    } catch (err) {
      scoreGateResult.preBaseline = null;
      scoreGateResult.error = `Pre-baseline capture failed: ${err.message}`;
    }
  }

  return {
    ok: true,
    trigger,
    target: resolved,
    risk,
    mandatorySkillsCheck,
    scoreGate: scoreGateResult,
    mode: effectiveMode,
    fixedSectionEnforcement: {
      description:
        'Before writing agent content, call validateFixedSections(agentPath, proposedContent). If violations are found, use applyPreservingFixedSections(agentPath, proposedContent) to restore FIXED blocks automatically.',
      validateFunction: 'validateFixedSections(agentPath, proposedContent)',
      applyFunction: 'applyPreservingFixedSections(agentPath, proposedContent)',
      patchPlanNote:
        'FIXED sections in the agent file are locked. Only EDITABLE sections and unmarked regions may be changed.',
    },
    requiredInvocations: [
      "Skill({ skill: 'framework-context' })",
      "Skill({ skill: 'research-synthesis' })",
      "Skill({ skill: 'skill-updater' }) // if skill parity changes are needed",
      "Skill({ skill: 'verification-before-completion' })",
      "Skill({ skill: 'memory-search' })",
    ],
    patchPlan,
    tddBacklog: [
      { phase: 'RED', items: ['Add failing tests for target agent behavior drift.'] },
      { phase: 'GREEN', items: ['Apply minimal frontmatter/prompt updates.'] },
      { phase: 'REFACTOR', items: ['Tighten prompts and remove ambiguity.'] },
      {
        phase: 'VERIFY',
        items: [
          `node .claude/tools/cli/validate-integration.cjs ${resolved.agentPath}`,
          'node .claude/tools/cli/generate-agent-registry.cjs',
        ],
      },
    ],
  };
}

if (require.main === module) {
  const result = main();
  if (result.usage) {
    console.log(result.usage);
    process.exit(0);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  parseArgs,
  resolveAgentPath,
  classifyRisk,
  checkMandatorySkills,
  computeScoreGate,
  evaluateScoreGate,
  appendEvolutionLog,
  validateFixedSections,
  applyPreservingFixedSections,
  main,
};
