'use strict';

/**
 * ralph-loop skill — main execution script
 *
 * Provides CLI interface for managing ralph loop state and configuration.
 *
 * Usage:
 *   node .claude/skills/ralph-loop/scripts/main.cjs status
 *   node .claude/skills/ralph-loop/scripts/main.cjs reset
 *   node .claude/skills/ralph-loop/scripts/main.cjs config --max-iterations 30
 */

const fs = require('fs');
const path = require('path');

// Resolve to the agent-studio project root.
// Path: scripts/ -> ralph-loop/ -> skills/ -> .claude/ -> agent-studio/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'ralph-state.json');
const GUARDRAILS_FILE = path.join(PROJECT_ROOT, '.claude', 'ralph', 'guardrails.md');
const PROMPT_FILE = path.join(PROJECT_ROOT, '.claude', 'ralph', 'PROMPT.md');

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function status() {
  const state = loadState();
  if (!state) {
    console.log(JSON.stringify({ active: false, message: 'No active ralph loop' }));
    return;
  }
  console.log(
    JSON.stringify({
      active: true,
      iteration: state.iteration,
      startedAt: state.startedAt,
      lastRunAt: state.lastRunAt,
      lastFindingsCount: state.lastFindingsCount ?? 'unknown',
      promptExists: fs.existsSync(PROMPT_FILE),
      guardrailsExists: fs.existsSync(GUARDRAILS_FILE),
    })
  );
}

function reset() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log(JSON.stringify({ success: true, message: 'Ralph state cleared' }));
  } else {
    console.log(JSON.stringify({ success: true, message: 'No state to clear' }));
  }
}

function config(args) {
  const maxIterationsIdx = args.indexOf('--max-iterations');
  if (maxIterationsIdx !== -1 && args[maxIterationsIdx + 1]) {
    const val = parseInt(args[maxIterationsIdx + 1], 10);
    if (isNaN(val) || val < 1 || val > 100) {
      console.error('max-iterations must be between 1 and 100');
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        success: true,
        message: `Set RALPH_MAX_ITERATIONS=${val} in your environment to apply`,
        hint: `export RALPH_MAX_ITERATIONS=${val}`,
      })
    );
  } else {
    console.log(
      JSON.stringify({
        maxIterations: process.env.RALPH_MAX_ITERATIONS || 25,
        completionSignal: process.env.RALPH_COMPLETION_SIGNAL || 'RALPH_AUDIT_COMPLETE_NO_FINDINGS',
        stateFile: STATE_FILE,
        promptFile: PROMPT_FILE,
        guardrailsFile: GUARDRAILS_FILE,
      })
    );
  }
}

// ── CLI Entry ───────────────────────────────────────────────────────────────
const action = process.argv[2];
switch (action) {
  case 'status':
    status();
    break;
  case 'reset':
    reset();
    break;
  case 'config':
    config(process.argv.slice(3));
    break;
  default:
    console.log(`Usage: node main.cjs <status|reset|config> [options]
  status              Show current ralph loop state
  reset               Clear ralph loop state
  config              Show current configuration
  config --max-iterations N   Set max iterations hint`);
    process.exit(action ? 1 : 0);
}
