#!/usr/bin/env node

/**
 * Skill Evaluation Runner
 * Executes benchmark test cases for a skill, capturing output and metrics
 * for use by the grader/analyzer/comparator evaluation agents.
 *
 * Usage:
 *   node eval-runner.cjs --help
 *   node eval-runner.cjs --skill <path> [--cases <path>] [--output <dir>] [--tier light|full]
 *
 * Security: all child_process calls use shell: false (SE-02 compliance)
 * JSON parsing: uses safeParseJSON to prevent prototype pollution (SE-02)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// --- Safe JSON parse (SE-02: prototype pollution prevention) ---
// Inline minimal version; production code should import from .claude/lib/utils/safe-json.cjs
function safeParseJSON(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    // Strip prototype pollution keys
    if (parsed && typeof parsed === 'object') {
      for (const key of ['__proto__', 'constructor', 'prototype']) {
        delete parsed[key];
      }
    }
    return { success: true, data: parsed, error: null };
  } catch (err) {
    return { success: false, data: fallback !== undefined ? fallback : null, error: err.message };
  }
}

// --- Project root resolution ---
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// --- CLI argument parsing ---
const rawArgs = process.argv.slice(2);
const options = {};
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    const key = rawArgs[i].slice(2);
    const nextVal = rawArgs[i + 1];
    const value = nextVal && !nextVal.startsWith('--') ? rawArgs[++i] : true;
    options[key] = value;
  }
}

// --- Help text ---
function printHelp() {
  process.stdout.write(
    `
Skill Evaluation Runner

Executes benchmark test cases for a skill (with-skill and baseline tracks),
captures outputs and metrics, and writes a structured eval directory ready
for the grader/comparator/analyzer agents.

Usage:
  node eval-runner.cjs [options]

Options:
  --skill <path>      Path to SKILL.md (required unless --help)
  --cases <path>      Path to eval/cases.json (optional; auto-generated if missing)
  --output <dir>      Output directory (default: .claude/context/tmp/eval-<timestamp>/)
  --tier <tier>       Evaluation tier: light (grade only) | full (default)
  --dry-run           Print what would run without executing test cases
  --help              Show this help message

Examples:
  node eval-runner.cjs --skill .claude/skills/tdd/SKILL.md
  node eval-runner.cjs --skill .claude/skills/tdd/SKILL.md --tier light
  node eval-runner.cjs --skill .claude/skills/tdd/SKILL.md --cases ./my-cases.json --output /tmp/eval-out

Output structure:
  <output-dir>/
    with-skill/
      transcript.json      Agent conversation log (placeholder for manual runs)
      output-files.json    Files produced during run
      metrics.json         Tokens, timing, tool-call-count
    baseline/
      transcript.json
      output-files.json
      metrics.json
    assertions.json        Assertions loaded or generated from skill
    eval-meta.json         Run metadata (skill path, tier, timestamp, run_id)

Exit codes:
  0  Success (eval directory written)
  1  Error (invalid args, file not found, write failure)
`.trim() + '\n'
  );
}

// --- Default test case generation from skill frontmatter ---
function generateDefaultCases(skillPath) {
  const skillContent = fs.readFileSync(skillPath, 'utf8');

  // Extract name from frontmatter
  const nameMatch = skillContent.match(/^name:\s*(.+)$/m);
  const descMatch = skillContent.match(/^description:\s*(.+)$/m);
  const skillName = nameMatch ? nameMatch[1].trim() : path.basename(path.dirname(skillPath));
  const description = descMatch ? descMatch[1].trim() : `Invoke the ${skillName} skill`;

  return {
    generated: true,
    skill_name: skillName,
    cases: [
      {
        id: 'default-invocation',
        description: `Basic invocation: ${description}`,
        prompt: `Invoke Skill({ skill: '${skillName}' }) and execute its primary workflow on a minimal example.`,
        assertions: [
          {
            type: 'tool_called',
            description: 'Skill was invoked',
            value: `Skill.*${skillName}`,
          },
          {
            type: 'does_not_contain',
            description: 'No TODO placeholders in output',
            value: 'TODO',
          },
          {
            type: 'custom',
            description: 'Agent completed at least one step of the skill workflow',
            value: 'agent produced non-empty output related to skill purpose',
          },
        ],
      },
    ],
  };
}

// --- Write JSON safely ---
function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// --- Build placeholder track output ---
function buildPlaceholderTrack(trackName, skillPath, tier) {
  const now = Date.now();
  return {
    transcript: {
      _note: 'This is a placeholder. In a live eval, the agent conversation log is captured here.',
      track: trackName,
      skill_active: trackName === 'with-skill',
      skill_path: trackName === 'with-skill' ? skillPath : null,
      steps: [],
      completed_at: new Date(now).toISOString(),
    },
    output_files: {
      _note:
        'List files produced during the run. Populated by the evaluating agent after execution.',
      files: [],
    },
    metrics: {
      track: trackName,
      tier,
      token_estimate: null,
      tool_call_count: null,
      wall_time_ms: null,
      captured_at: new Date(now).toISOString(),
      _note: 'Metrics are populated during live execution. Null values indicate placeholder run.',
    },
  };
}

// --- Main ---
function main() {
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.skill) {
    process.stderr.write('Error: --skill <path> is required\n');
    process.stderr.write('Run with --help for usage.\n');
    process.exit(1);
  }

  // Resolve skill path
  const skillPath = path.resolve(PROJECT_ROOT, options.skill);
  if (!fs.existsSync(skillPath)) {
    process.stderr.write(`Error: skill file not found: ${skillPath}\n`);
    process.exit(1);
  }

  const tier = options.tier || 'full';
  if (!['light', 'full'].includes(tier)) {
    process.stderr.write(`Error: --tier must be 'light' or 'full', got: ${tier}\n`);
    process.exit(1);
  }

  // Resolve output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = options.output
    ? path.resolve(PROJECT_ROOT, options.output)
    : path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', `eval-${timestamp}`);

  // Resolve cases
  let cases;
  if (options.cases) {
    const casesPath = path.resolve(PROJECT_ROOT, options.cases);
    if (!fs.existsSync(casesPath)) {
      process.stderr.write(`Error: cases file not found: ${casesPath}\n`);
      process.exit(1);
    }
    const raw = fs.readFileSync(casesPath, 'utf8');
    const { success, data, error } = safeParseJSON(raw, null);
    if (!success) {
      process.stderr.write(`Error: could not parse cases JSON: ${error}\n`);
      process.exit(1);
    }
    cases = data;
  } else {
    // Check for eval/cases.json alongside the skill
    const defaultCasesPath = path.join(path.dirname(skillPath), 'eval', 'cases.json');
    if (fs.existsSync(defaultCasesPath)) {
      const raw = fs.readFileSync(defaultCasesPath, 'utf8');
      const { success, data, error } = safeParseJSON(raw, null);
      if (!success) {
        process.stderr.write(
          `Warning: could not parse default cases at ${defaultCasesPath}: ${error}\n`
        );
        process.stderr.write('Falling back to auto-generated cases.\n');
        cases = generateDefaultCases(skillPath);
      } else {
        cases = data;
      }
    } else {
      process.stderr.write(
        `Info: no cases file found; auto-generating default cases from skill frontmatter.\n`
      );
      cases = generateDefaultCases(skillPath);
    }
  }

  const runId = `eval-${timestamp}`;
  const skillName = path.basename(path.dirname(skillPath));

  if (options['dry-run']) {
    process.stdout.write(`[dry-run] Would write eval directory: ${outputDir}\n`);
    process.stdout.write(`[dry-run] Skill: ${skillPath}\n`);
    process.stdout.write(`[dry-run] Tier: ${tier}\n`);
    process.stdout.write(`[dry-run] Cases: ${cases.cases ? cases.cases.length : 0} test case(s)\n`);
    process.stdout.write(`[dry-run] Run ID: ${runId}\n`);
    process.exit(0);
  }

  // Write eval directory structure
  try {
    // Assertions
    writeJSON(path.join(outputDir, 'assertions.json'), {
      source: options.cases || 'auto-generated',
      generated: !!cases.generated,
      skill_name: skillName,
      case_count: cases.cases ? cases.cases.length : 0,
      cases: cases.cases || [],
    });

    // with-skill track placeholders
    const withSkill = buildPlaceholderTrack('with-skill', skillPath, tier);
    writeJSON(path.join(outputDir, 'with-skill', 'transcript.json'), withSkill.transcript);
    writeJSON(path.join(outputDir, 'with-skill', 'output-files.json'), withSkill.output_files);
    writeJSON(path.join(outputDir, 'with-skill', 'metrics.json'), withSkill.metrics);

    // baseline track placeholders
    const baseline = buildPlaceholderTrack('baseline', skillPath, tier);
    writeJSON(path.join(outputDir, 'baseline', 'transcript.json'), baseline.transcript);
    writeJSON(path.join(outputDir, 'baseline', 'output-files.json'), baseline.output_files);
    writeJSON(path.join(outputDir, 'baseline', 'metrics.json'), baseline.metrics);

    // eval metadata
    writeJSON(path.join(outputDir, 'eval-meta.json'), {
      run_id: runId,
      skill_path: skillPath,
      skill_name: skillName,
      tier,
      cases_source: options.cases || 'auto-generated',
      case_count: cases.cases ? cases.cases.length : 0,
      output_dir: outputDir,
      created_at: new Date().toISOString(),
      status: 'scaffolded',
      _note:
        'Status "scaffolded" means the directory structure is ready for agent execution. ' +
        'Run the with-skill and baseline tracks, then invoke the grader agent.',
      next_steps: [
        '1. Execute with-skill track: run agent with skill active, capture transcript + output files',
        '2. Execute baseline track: run agent without skill, capture transcript + output files',
        '3. Update with-skill/metrics.json and baseline/metrics.json with actual token/timing data',
        '4. Invoke grader agent: pass this directory as input',
        tier === 'full'
          ? '5. (full tier) Invoke comparator agent, then analyzer agent'
          : '5. (light tier) Review grader report for instruction_score and assertion results',
      ],
    });
  } catch (err) {
    process.stderr.write(`Error writing eval directory: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Eval directory scaffolded: ${outputDir}\n`);
  process.stdout.write(`Run ID: ${runId}\n`);
  process.stdout.write(`Tier: ${tier}\n`);
  process.stdout.write(
    `Cases: ${cases.cases ? cases.cases.length : 0} test case(s) (${cases.generated ? 'auto-generated' : 'from file'})\n`
  );
  process.stdout.write(`\nNext step: execute the with-skill and baseline tracks, then grade.\n`);
  process.stdout.write(`See ${path.join(outputDir, 'eval-meta.json')} for instructions.\n`);
}

main();
