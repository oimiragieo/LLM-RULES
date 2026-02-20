#!/usr/bin/env node
/**
 * Wave Executor — Fresh-Process Orchestration Engine
 *
 * Reads a wave plan JSON file and executes each wave in a fresh
 * Claude Code subprocess via the Agent SDK. Each wave = new Bun
 * process = clean GC state, preventing the JSC use-after-free
 * crash that occurs under heavy multi-agent orchestration.
 *
 * Usage:
 *   node wave-executor.mjs --plan <path>                   Execute all waves
 *   node wave-executor.mjs --plan <path> --dry-run         Preview without executing
 *   node wave-executor.mjs --plan <path> --start-from 5    Resume from wave 5
 *   node wave-executor.mjs --plan <path> --json            Machine-readable output
 *   node wave-executor.mjs --help                          Show help
 *
 * @module wave-executor
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Project Root
// ---------------------------------------------------------------------------

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments for the wave executor.
 *
 * @param {string[]} argv
 * @returns {{ plan: string|null, model: string, dryRun: boolean, json: boolean, startFrom: number, maxTurnsPerWave: number, help: boolean }}
 */
export function parseWaveArgs(argv) {
  const args = {
    plan: null,
    model: 'claude-sonnet-4-6',
    dryRun: false,
    json: false,
    startFrom: 1,
    maxTurnsPerWave: 50,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--plan' && argv[i + 1]) {
      args.plan = argv[++i];
    } else if (arg === '--model' && argv[i + 1]) {
      args.model = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--start-from' && argv[i + 1]) {
      args.startFrom = parseInt(argv[++i], 10) || 1;
    } else if (arg === '--max-turns' && argv[i + 1]) {
      args.maxTurnsPerWave = parseInt(argv[++i], 10) || 50;
    } else if (arg === '--help') {
      args.help = true;
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Plan File
// ---------------------------------------------------------------------------

/**
 * Read and validate a wave plan JSON file.
 *
 * @param {string} planPath - Absolute or relative path to plan JSON
 * @returns {{ ok: boolean, plan: Object|null, error: string|null }}
 */
export function readPlanFile(planPath) {
  if (!planPath) return { ok: false, plan: null, error: 'No plan path provided' };

  const resolved = path.resolve(planPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, plan: null, error: `Plan file not found: ${resolved}` };
  }

  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    return { ok: false, plan: null, error: `Failed to read plan file: ${err.message}` };
  }

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    return { ok: false, plan: null, error: `Invalid JSON in plan file: ${err.message}` };
  }

  if (!plan.waves || !Array.isArray(plan.waves)) {
    return { ok: false, plan: null, error: 'Plan file must contain a "waves" array' };
  }

  if (plan.waves.length === 0) {
    return { ok: false, plan: null, error: 'Plan file "waves" array is empty' };
  }

  for (const wave of plan.waves) {
    if (!wave.id && wave.id !== 0) {
      return { ok: false, plan: null, error: 'Each wave must have an "id" field' };
    }
    if (!wave.skills || !Array.isArray(wave.skills) || wave.skills.length === 0) {
      return {
        ok: false,
        plan: null,
        error: `Wave ${wave.id} must have a non-empty "skills" array`,
      };
    }
  }

  return { ok: true, plan, error: null };
}

// ---------------------------------------------------------------------------
// Inventory Management
// ---------------------------------------------------------------------------

const DEFAULT_INVENTORY_PATH = '.claude/context/runtime/wave-inventory.json';

/**
 * Read the wave inventory (tracks completed waves).
 *
 * @param {string} inventoryPath - Absolute path to inventory JSON
 * @returns {{ planName: string, startedAt: string, completedWaves: number[], waveResults: Object, errors: string[] }}
 */
export function readInventory(inventoryPath) {
  const empty = {
    planName: '',
    startedAt: '',
    completedWaves: [],
    waveResults: {},
    errors: [],
  };

  if (!fs.existsSync(inventoryPath)) return empty;

  try {
    const raw = fs.readFileSync(inventoryPath, 'utf8');
    const data = JSON.parse(raw);
    return {
      planName: data.planName || '',
      startedAt: data.startedAt || '',
      completedWaves: Array.isArray(data.completedWaves) ? data.completedWaves : [],
      waveResults: data.waveResults || {},
      errors: Array.isArray(data.errors) ? data.errors : [],
    };
  } catch {
    return empty;
  }
}

/**
 * Update inventory with a completed wave result.
 *
 * @param {string} inventoryPath
 * @param {string} planName
 * @param {number} waveId
 * @param {Object} waveResult
 */
export function updateInventory(inventoryPath, planName, waveId, waveResult) {
  const inventory = readInventory(inventoryPath);
  inventory.planName = planName;
  if (!inventory.startedAt) {
    inventory.startedAt = new Date().toISOString();
  }

  if (!inventory.completedWaves.includes(waveId)) {
    inventory.completedWaves.push(waveId);
  }

  inventory.waveResults[String(waveId)] = waveResult;

  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build a wave prompt from the wave definition.
 *
 * @param {Object} wave - Wave definition from plan
 * @param {Object} plan - Full plan object
 * @returns {string}
 */
export function buildWavePrompt(wave, plan) {
  const skills = wave.skills.join(', ');
  const domain = wave.domain || 'general';

  if (wave.promptTemplate) {
    return wave.promptTemplate
      .replace(/\{skills\}/g, skills)
      .replace(/\{domain\}/g, domain)
      .replace(/\{waveId\}/g, String(wave.id));
  }

  // Default prompt template
  return [
    `Execute wave ${wave.id} of plan "${plan.name || 'unnamed'}".`,
    `Skills to process: ${skills}`,
    `Domain: ${domain}`,
    '',
    'For each skill:',
    "1. Read the skill's SKILL.md and any .claude/rules/ file for domain context",
    '2. Perform the required work as described in the plan',
    '3. Validate results (JSON schema parse, Node.js syntax check where applicable)',
    '4. Commit changes with a clear message',
    '',
    `Report results as JSON when done.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Wave Execution (SDK)
// ---------------------------------------------------------------------------

/**
 * Execute a single wave using the Claude Agent SDK.
 * Each call spawns a fresh Bun process.
 *
 * @param {Object} wave - Wave definition
 * @param {Object} plan - Full plan object
 * @param {string} projectRoot
 * @param {Object} options
 * @returns {Promise<{ status: string, skillsProcessed: number, cost: string, error: string|null, durationMs: number }>}
 */
async function executeWave(wave, plan, projectRoot, options = {}) {
  const { model = 'claude-sonnet-4-6', maxTurns = 50 } = options;

  let queryFn;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
  } catch (err) {
    return {
      status: 'error',
      skillsProcessed: 0,
      cost: '$0.00',
      error: `Failed to load Claude Agent SDK: ${err.message}`,
      durationMs: 0,
    };
  }

  const prompt = buildWavePrompt(wave, plan);
  const startTime = Date.now();

  try {
    const response = queryFn({
      prompt,
      options: {
        model,
        cwd: projectRoot,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['user', 'project'],
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        maxTurns,
      },
    });

    let _resultText = '';
    let totalCost = 0;

    for await (const message of response) {
      // Stream assistant text to stdout for visibility
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            process.stderr.write(block.text);
          }
        }
      }

      // Capture final result
      if (message.type === 'result') {
        _resultText = message.result || '';
        totalCost = message.total_cost_usd || 0;
      }
    }

    return {
      status: 'completed',
      skillsProcessed: wave.skills.length,
      cost: `$${totalCost.toFixed(2)}`,
      error: null,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      status: 'error',
      skillsProcessed: 0,
      cost: '$0.00',
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(`
wave-executor — Fresh-process orchestration for EPIC-tier batch pipelines

Usage:
  node wave-executor.mjs --plan <path>                   Execute all waves
  node wave-executor.mjs --plan <path> --dry-run         Preview without executing
  node wave-executor.mjs --plan <path> --start-from 5    Resume from wave 5
  node wave-executor.mjs --plan <path> --json            Machine-readable output
  node wave-executor.mjs --help                          Show this help

Options:
  --plan <path>        Path to wave plan JSON file (required)
  --model <model>      Claude model to use (default: claude-sonnet-4-6)
  --max-turns <n>      Max turns per wave (default: 50)
  --start-from <n>     Resume from wave N (default: 1)
  --dry-run            Preview plan without executing waves
  --json               Machine-readable JSON output
  --help               Show this help message

Plan file format:
  {
    "name": "my-pipeline",
    "waves": [
      { "id": 1, "skills": ["skill-a", "skill-b"], "domain": "language" }
    ],
    "config": {
      "model": "claude-sonnet-4-6",
      "maxTurnsPerWave": 50,
      "sleepBetweenWaves": 3000,
      "inventoryPath": ".claude/context/runtime/wave-inventory.json"
    }
  }
`);
}

async function main() {
  const args = parseWaveArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.plan) {
    process.stderr.write('Error: --plan <path> is required. Use --help for usage.\n');
    process.exit(1);
  }

  const projectRoot = findProjectRoot();

  // Read plan
  const { ok, plan, error } = readPlanFile(args.plan);
  if (!ok) {
    process.stderr.write(`Error: ${error}\n`);
    process.exit(1);
  }

  // Resolve config
  const config = plan.config || {};
  const model = args.model || config.model || 'claude-sonnet-4-6';
  const maxTurns = args.maxTurnsPerWave || config.maxTurnsPerWave || 50;
  const sleepMs = config.sleepBetweenWaves || 3000;
  const inventoryPath = path.resolve(projectRoot, config.inventoryPath || DEFAULT_INVENTORY_PATH);

  // Read inventory for resume support
  const inventory = readInventory(inventoryPath);

  // Filter waves: skip completed and before startFrom
  const pendingWaves = plan.waves.filter(
    w => w.id >= args.startFrom && !inventory.completedWaves.includes(w.id)
  );

  if (!args.json) {
    process.stdout.write(`\nWave Executor — ${plan.name || 'unnamed plan'}\n`);
    process.stdout.write(
      `Total waves: ${plan.waves.length} | Pending: ${pendingWaves.length} | Already completed: ${inventory.completedWaves.length}\n`
    );
    process.stdout.write(`Model: ${model} | Max turns/wave: ${maxTurns}\n\n`);
  }

  // Dry-run: show plan and exit
  if (args.dryRun) {
    const summary = {
      success: true,
      dryRun: true,
      planName: plan.name || 'unnamed',
      wavesTotal: plan.waves.length,
      wavesPending: pendingWaves.length,
      wavesAlreadyCompleted: inventory.completedWaves.length,
      model,
      maxTurnsPerWave: maxTurns,
      waves: pendingWaves.map(w => ({
        id: w.id,
        skills: w.skills,
        domain: w.domain || 'general',
      })),
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    } else {
      process.stdout.write('[DRY RUN] Would execute these waves:\n');
      for (const w of pendingWaves) {
        process.stdout.write(`  Wave ${w.id}: ${w.skills.join(', ')} (${w.domain || 'general'})\n`);
      }
    }
    process.exit(0);
  }

  // Execute waves
  let wavesCompleted = 0;
  let totalSkills = 0;
  let totalCost = 0;
  const errors = [];

  for (const wave of pendingWaves) {
    if (!args.json) {
      process.stdout.write(
        `\n=== Wave ${wave.id}/${plan.waves.length}: ${wave.skills.join(', ')} ===\n`
      );
    }

    const result = await executeWave(wave, plan, projectRoot, { model, maxTurns });

    if (result.status === 'completed') {
      wavesCompleted++;
      totalSkills += result.skillsProcessed;
      totalCost += parseFloat(result.cost.replace('$', '')) || 0;

      updateInventory(inventoryPath, plan.name || 'unnamed', wave.id, result);

      if (!args.json) {
        process.stdout.write(
          `\n  Wave ${wave.id} complete: ${result.skillsProcessed} skills, ${result.cost}, ${(result.durationMs / 1000).toFixed(1)}s\n`
        );
      }
    } else {
      errors.push(`Wave ${wave.id}: ${result.error}`);
      if (!args.json) {
        process.stderr.write(`\n  Wave ${wave.id} FAILED: ${result.error}\n`);
      }
    }

    // Sleep between waves (let OS clean up process resources)
    if (pendingWaves.indexOf(wave) < pendingWaves.length - 1) {
      await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
  }

  // Final summary
  const summary = {
    success: errors.length === 0,
    wavesCompleted,
    wavesTotal: plan.waves.length,
    skillsProcessed: totalSkills,
    totalCost: `$${totalCost.toFixed(2)}`,
    inventoryPath,
    errors,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(`\n--- Wave Executor Complete ---\n`);
    process.stdout.write(
      `Waves: ${wavesCompleted}/${plan.waves.length} | Skills: ${totalSkills} | Cost: $${totalCost.toFixed(2)}\n`
    );
    if (errors.length > 0) {
      process.stdout.write(`Errors: ${errors.length}\n`);
      for (const e of errors) process.stdout.write(`  - ${e}\n`);
    }
  }

  process.exitCode = errors.length > 0 ? 1 : 0;
}

// Only run main when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('wave-executor.mjs') || process.argv[1].endsWith('wave-executor'));

if (isDirectRun) {
  main().catch(err => {
    process.stderr.write(`Fatal error: ${err.message}\n`);
    process.exit(2);
  });
}
