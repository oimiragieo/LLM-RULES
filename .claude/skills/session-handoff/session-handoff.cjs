#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');

// Path resolution
const projectRoot = process.cwd();
const runtimeDir = path.join(projectRoot, '.claude/context/runtime');
const memoryDir = path.join(projectRoot, '.claude/context/memory');
const tasksFile = path.join(runtimeDir, 'tasks.json');

console.log('[session-handoff] Initiating programmatic session handoff...');
const args = process.argv.slice(2);
const autoSuspend = args.includes('--auto-suspend');

// MT-B: Drain-complete gate via tasks database reading
let tasks = [];
if (fs.existsSync(tasksFile)) {
  try {
    tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  } catch (e) {
    console.error(`[session-handoff] Failed to read tasks database: ${e.message}`);
    process.exit(1);
  }
}

const activeTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'blocked');
if (activeTasks.length > 0) {
  if (autoSuspend) {
    console.log(
      `[session-handoff] --auto-suspend flag detected. Suspending ${activeTasks.length} active tasks...`
    );
    let modified = false;
    tasks.forEach(t => {
      if (t.status === 'in_progress' || t.status === 'blocked') {
        t.status = 'suspended';
        t.metrics = t.metrics || {};
        t.metrics.suspended_at = new Date().toISOString();
        t.metrics.suspend_reason = 'Auto-suspended during session handoff via --auto-suspend flag';
        modified = true;
      }
    });
    if (modified) {
      try {
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
        console.log(`[session-handoff] Tasks successfully suspended.`);
      } catch (e) {
        console.error(
          `[session-handoff] Failed to write tasks database during suspend: ${e.message}`
        );
        process.exit(1);
      }
    }
  } else {
    console.error(`\n[session-handoff] ABORT: Cannot handoff session while tasks are active.`);
    console.error(`Active tasks found:`);
    activeTasks.forEach(t => console.error(`  - [${t.id}] ${t.description} (${t.status})`));
    console.error(
      `\nPlease instruct the model to finish or formally suspend these tasks before handing off, or pass the --auto-suspend flag.`
    );
    process.exit(1);
  }
}

// Ensure runtime dir exists
if (!fs.existsSync(runtimeDir)) {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

const sessionId = getOrCreateSessionId(runtimeDir);

// countTokens() — reads token count from budget-tracker.json (mock-friendly)
function countTokens() {
  try {
    const budgetPath = path.join(runtimeDir, 'budget-tracker.json');
    if (!fs.existsSync(budgetPath)) return 0;
    const raw = fs.readFileSync(budgetPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return 0;
    const entry = data[sessionId];
    if (entry && typeof entry.totalTokens === 'number') {
      return entry.totalTokens;
    }
    return 0;
  } catch (_e) {
    return 0;
  }
}

// Read context summary from active_context if available
let contextSummary = 'Context transferred via session-handoff skill.';
const activeContextPath = path.join(memoryDir, 'active_context.md');
if (fs.existsSync(activeContextPath)) {
  contextSummary = fs.readFileSync(activeContextPath, 'utf8').substring(0, 100000);
}

// Build structured resumeInstructions from available context
function buildResumeInstructions() {
  // Extract objective from active_context.md (first heading or first line)
  let objective = 'Resume previous session work.';
  if (fs.existsSync(activeContextPath)) {
    const lines = fs.readFileSync(activeContextPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
        objective = trimmed.replace(/^#+\s+/, '');
        break;
      } else if (trimmed.length > 10 && !trimmed.startsWith('<!--')) {
        objective = trimmed;
        break;
      }
    }
  }

  // Build openTasks from tasks database
  const openTasks = tasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'suspended')
    .map(t => `${t.id}: ${t.description || t.subject || '(no description)'}`);

  // Key files — gather recently referenced files from active_context
  const keyFiles = [];
  if (fs.existsSync(activeContextPath)) {
    const content = fs.readFileSync(activeContextPath, 'utf8');
    const fileMatches = content.match(/\.claude\/[^\s"'\n,)]+\.(cjs|md|json|ts|js)/g) || [];
    const unique = [...new Set(fileMatches)].slice(0, 10);
    keyFiles.push(...unique);
  }

  // Recent decisions from decisions.md
  const recentDecisions = [];
  const decisionsPath = path.join(memoryDir, 'decisions.md');
  if (fs.existsSync(decisionsPath)) {
    const lines = fs.readFileSync(decisionsPath, 'utf8').split('\n');
    const adrLines = lines.filter(l => l.startsWith('## ADR') || l.startsWith('### ADR')).slice(-5);
    recentDecisions.push(...adrLines.map(l => l.replace(/^#+\s+/, '')));
  }

  // Risks from issues.md or defaults
  const risks = [];
  const issuesPath = path.join(memoryDir, 'issues.md');
  if (fs.existsSync(issuesPath)) {
    const lines = fs.readFileSync(issuesPath, 'utf8').split('\n');
    const issueLines = lines.filter(l => l.startsWith('- ') || l.startsWith('* ')).slice(-5);
    risks.push(...issueLines.map(l => l.replace(/^[-*]\s+/, '')));
  }

  // Resume prompt — be explicit about executing ALL work, not just discovering it
  const resumePrompt = `You are resuming an in-progress session. Read .claude/context/memory/active_context.md FIRST and execute ALL tasks listed under NEXT ACTION (IMMEDIATE). Do NOT stop after one task — complete the FULL pipeline. Use TaskList() to track progress. Spawn specialist agents for each wave. Do NOT just clean up stale tasks and stop.`;

  return {
    objective,
    nextStep:
      openTasks.length > 0
        ? `Continue with: ${openTasks[0]}`
        : 'Run TaskList() to discover pending work',
    openTasks,
    keyFiles,
    recentDecisions,
    risks,
    resumePrompt,
  };
}

// pendingMemoryWrites from learnings.md
function extractPendingMemoryWrites() {
  const writes = [];
  const learningsPath = path.join(memoryDir, 'learnings.md');
  if (!fs.existsSync(learningsPath)) return writes;
  try {
    const content = fs.readFileSync(learningsPath, 'utf8');
    const lines = content.split('\n');
    const bulletLines = lines.filter(l => l.startsWith('- ') || l.startsWith('* ')).slice(-10);
    writes.push(...bulletLines.map(l => l.replace(/^[-*]\s+/, '')));
  } catch (_e) {
    // ignore
  }
  return writes;
}

// countTokens() pre-validation
const tokenCount = countTokens();
process.stderr.write(`[session-handoff] Token count from budget-tracker: ${tokenCount}\n`);

const resumeInstructions = buildResumeInstructions();
const pendingMemoryWrites = extractPendingMemoryWrites();

// Generate session name for --name flag: shift-YYYY-MM-DD-HH
function buildSessionName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  return `shift-${yyyy}-${mm}-${dd}-${hh}`;
}

const sessionName = buildSessionName();

// Build the M7.1 Log with structured resumeInstructions
const handoverData = {
  schemaVersion: '2.0.0',
  generation: 1,
  sessionId: sessionId,
  status: 'READY',
  tokenCount: tokenCount,
  resumeInstructions: resumeInstructions,
  fallbackInstruction: 'Run TaskList() to discover pending work, check active_context.md',
  contextSummary: contextSummary,
  pendingMemoryWrites: pendingMemoryWrites,
  timestamp: new Date().toISOString(),
};

const tmpPath = path.join(runtimeDir, `shift-change-log.tmp-${Date.now()}.json`);
const finalPath = path.join(runtimeDir, 'shift-change-log.json');

try {
  // Write atomic
  fs.writeFileSync(tmpPath, JSON.stringify(handoverData, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);
  console.log(`[session-handoff] Wrote READY handover log atomically.`);
} catch (e) {
  console.error(`[session-handoff] Failed to write handover log: ${e.message}`);
  process.exit(1);
}

// M7.1 Spawn directly
console.log(`[session-handoff] Spawning new terminal session (name: ${sessionName})...`);
const spawnScript = path.join(projectRoot, 'scripts/spawn-new-session.cjs');
if (!fs.existsSync(spawnScript)) {
  console.error(`[session-handoff] Fatal: Cannot find spawn script at ${spawnScript}`);
  process.exit(1);
}

try {
  // Execute the spawn script synchronously with --name flag and --skip-drain
  execFileSync('node', [spawnScript, '--skip-drain', '--name', sessionName], { stdio: 'inherit' });
  console.log(`[session-handoff] Handoff execution completed successfully.`);
} catch (e) {
  console.error(`[session-handoff] Spawn script failure: ${e.message}`);
  process.exit(1);
}
