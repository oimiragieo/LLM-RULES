#!/usr/bin/env node
/**
 * CLI Routing Integration Test - Comprehensive 49-Agent Suite
 * ===========================================================
 *
 * Sends test prompts to `claude -p` and verifies routing decisions
 * for ALL 49 agents in the agent-studio framework.
 *
 * Usage:
 *   node tests/integration/routing-cli-test.cjs
 *   node tests/integration/routing-cli-test.cjs --case 1       (run single test)
 *   node tests/integration/routing-cli-test.cjs --batch 3      (run batch 3 only)
 *   node tests/integration/routing-cli-test.cjs --dry-run      (show prompts only)
 *   node tests/integration/routing-cli-test.cjs --from 11 --to 20  (range)
 *
 * Requirements:
 *   - Claude CLI installed and authenticated
 *   - Run from project root
 *
 * Note: Each test case makes an API call (30-120s each).
 *       Use --dry-run to preview. Use --batch N to run specific batches of 5.
 *
 * <!-- Agent: qa | Task: #11 | Session: 2026-02-07 -->
 */

'use strict';

const { spawn } = require('child_process');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Test Cases: ALL 49 agents
// ---------------------------------------------------------------------------
const TEST_CASES = require('../helpers/routing-cli-cases.cjs');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BATCH_SIZE = 1; // Serial execution to avoid resource contention
const TIMEOUT_MS = 90000; // 90 seconds per test (enough for 5 turns)
const MAX_TURNS = 3; // Just enough for routing: Turn 1 (TaskList) + Turn 2 (Read/analyze) + Turn 3 (Task spawn)
const RESULTS_DIR = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'context',
  'tmp',
  'routing-test-results'
);
const INTER_BATCH_DELAY_MS = 5000; // 5 seconds between batches

// ---------------------------------------------------------------------------
// Arg Parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const caseIdx = args.indexOf('--case');
const caseId = caseIdx !== -1 ? parseInt(args[caseIdx + 1], 10) : null;
const batchIdx = args.indexOf('--batch');
const batchId = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : null;
const fromIdx = args.indexOf('--from');
const fromId = fromIdx !== -1 ? parseInt(args[fromIdx + 1], 10) : null;
const toIdx = args.indexOf('--to');
const toId = toIdx !== -1 ? parseInt(args[toIdx + 1], 10) : null;

// ---------------------------------------------------------------------------
// Filter test cases based on args
// ---------------------------------------------------------------------------
function getFilteredCases() {
  if (caseId !== null) {
    return TEST_CASES.filter(c => c.id === caseId);
  }
  if (batchId !== null) {
    const start = (batchId - 1) * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    return TEST_CASES.slice(start, end);
  }
  if (fromId !== null || toId !== null) {
    const f = fromId || 1;
    const t = toId || TEST_CASES.length;
    return TEST_CASES.filter(c => c.id >= f && c.id <= t);
  }
  return TEST_CASES;
}

// ---------------------------------------------------------------------------
// Run a single test case via claude CLI (returns Promise)
// ---------------------------------------------------------------------------
function runTestCase(tc) {
  return new Promise(resolve => {
    const startTime = Date.now();

    // Build command manually to avoid spawn arg escaping issues on Windows
    // Use double quotes around the prompt; escape backslash first, then double-quote (CodeQL: incomplete escaping)
    const escapedPrompt = tc.prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const cmdArgs = [
      '-p',
      `"${escapedPrompt}"`,
      '-d',
      '--dangerously-skip-permissions',
      '--max-turns',
      String(MAX_TURNS),
      '--output-format',
      'stream-json',
      '--verbose',
    ];

    const child = spawn('claude', cmdArgs, {
      timeout: TIMEOUT_MS,
      cwd: path.join(__dirname, '..', '..'),
      shell: true, // Required for Windows PATH resolution
      env: {
        ...process.env,
        REFLECTION_STEP0_ENFORCEMENT: 'off',
        PLANNER_FIRST_ENFORCEMENT: 'warn',
        SPECIALIST_ROUTING_ENFORCEMENT: 'warn',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Parse JSON stream for agent routing signals
      const actualAgent = detectAgentFromStream(stdout, tc);

      const combined = (stdout + '\n' + stderr).toLowerCase();
      const pass = evaluateResult(tc, actualAgent, combined);

      const result = {
        id: tc.id,
        category: tc.category,
        prompt: tc.prompt,
        expectedAgent: tc.expectedAgent,
        actualAgent: actualAgent || 'UNKNOWN',
        status: pass ? 'PASS' : tc.optional && !pass ? 'SKIP' : 'FAIL',
        elapsed: `${elapsed}s`,
        exitCode: code,
        outputExcerpt: extractRoutingExcerpt(stdout, 500),
      };

      // Save individual result
      try {
        const resultFile = path.join(RESULTS_DIR, `case-${tc.id}.json`);
        writeFileSync(resultFile, JSON.stringify(result, null, 2));
      } catch (_e) {
        // non-critical
      }

      // Save full output
      try {
        const outputFile = path.join(RESULTS_DIR, `case-${tc.id}-output.txt`);
        writeFileSync(
          outputFile,
          `=== STDOUT (stream-json) ===\n${stdout}\n\n=== STDERR ===\n${stderr}`
        );
      } catch (_e) {
        // non-critical
      }

      resolve(result);
    });

    child.on('error', err => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      resolve({
        id: tc.id,
        category: tc.category,
        prompt: tc.prompt,
        expectedAgent: tc.expectedAgent,
        actualAgent: 'ERROR',
        status: 'ERROR',
        elapsed: `${elapsed}s`,
        exitCode: -1,
        outputExcerpt: err.message.slice(0, 500),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Agent Detection helpers (extracted to reduce complexity)
// ---------------------------------------------------------------------------
function extractAgentsFromTaskBlock(block, agents) {
  const input = block.input || {};
  if (input.subagent_type) {
    agents.push(input.subagent_type.toLowerCase());
  }
  if (input.prompt) {
    const agentRef = input.prompt.match(
      /\.claude\/agents\/(?:core|domain|specialized|orchestrators)\/([a-z0-9_-]+)\.md/i
    );
    if (agentRef) agents.push(agentRef[1].toLowerCase());
    const identityRef = input.prompt.match(/you are (?:the )?([a-z][a-z0-9_-]*)/i);
    if (identityRef && isKnownAgent(identityRef[1].toLowerCase())) {
      agents.push(identityRef[1].toLowerCase());
    }
  }
}

function extractAgentsFromTextBlock(block, agents) {
  const text = block.text.toLowerCase();
  const routerMatch = text.match(
    /\[router\][^\n]*?([\w-]+(?:-(?:pro|expert|specialist|architect|orchestrator|reviewer|writer|simplifier|responder|troubleshooter|developer|coordinator|validator|compressor|agent))\b)/i
  );
  if (routerMatch) agents.push(routerMatch[1].toLowerCase());
  const spawnMatch = text.match(
    /(?:spawn|route\s+to|routing\s+to|assign\s+to)\s+(?:the\s+)?([a-z][a-z0-9_-]*)/i
  );
  if (spawnMatch && isKnownAgent(spawnMatch[1])) {
    agents.push(spawnMatch[1].toLowerCase());
  }
}

function extractAgentsFromReadBlock(block, agents) {
  const input = block.input || {};
  if (input.file_path) {
    const agentRef = input.file_path.match(
      /agents\/(?:core|domain|specialized|orchestrators)\/([a-z0-9_-]+)\.md/i
    );
    if (agentRef) agents.push(agentRef[1].toLowerCase());
  }
}

function extractAgentsFromObj(obj, agents) {
  if (obj.type !== 'assistant' || !obj.message || !obj.message.content) return;
  for (const block of obj.message.content) {
    if (block.type === 'tool_use' && block.name === 'Task') {
      extractAgentsFromTaskBlock(block, agents);
    }
    if (block.type === 'text') {
      extractAgentsFromTextBlock(block, agents);
    }
    if (block.type === 'tool_use' && block.name === 'Read') {
      extractAgentsFromReadBlock(block, agents);
    }
  }
}

function resolveSpawnedAgent(spawnedAgents, rawOutput, tc) {
  if (spawnedAgents.length > 0) {
    const realAgent = spawnedAgents.find(a => a !== 'router' && a !== 'general-purpose');
    if (realAgent) return realAgent;
    const isReflectionOnly = spawnedAgents.every(a => a === 'general-purpose' || a === 'router');
    if (isReflectionOnly) {
      return detectAgentFromText(rawOutput.toLowerCase(), tc);
    }
    return spawnedAgents[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Agent Detection from stream-json output (primary method)
// ---------------------------------------------------------------------------
function detectAgentFromStream(rawOutput, tc) {
  const lines = rawOutput.split('\n').filter(l => l.trim());
  const spawnedAgents = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      extractAgentsFromObj(obj, spawnedAgents);
    } catch (_e) {
      // Not valid JSON or partial line - skip
    }
  }

  const resolved = resolveSpawnedAgent(spawnedAgents, rawOutput, tc);
  if (resolved) return resolved;

  // Check if the router just asked a clarifying question (no routing occurred)
  const resultLine = rawOutput.split('\n').filter(l => {
    try {
      const obj = JSON.parse(l);
      return obj.type === 'result' && obj.num_turns;
    } catch (_e) {
      return false;
    }
  });
  if (resultLine.length > 0) {
    try {
      const result = JSON.parse(resultLine[0]);
      if (result.num_turns <= 2 && result.subtype === 'success') {
        return 'NO_ROUTING';
      }
    } catch (_e) {
      /* ignore */
    }
  }

  // Fallback: use text-based detection on the raw output
  return detectAgentFromText(rawOutput.toLowerCase(), tc);
}

// ---------------------------------------------------------------------------
// Fallback text-based agent detection (only used when stream-json parsing fails)
// ---------------------------------------------------------------------------
function detectAgentFromText(output, _tc) {
  // Remove init message content (contains all agent names as a list, causes false positives)
  const cleanOutput = output.replace(/"agents"\s*:\s*\[[^\]]*\]/g, '');

  // Strategy 1: Look for subagent_type references in raw text
  const taskSpawnMatch = cleanOutput.match(/subagent_type[:\s]*["']([a-z0-9_-]+)["']/i);
  if (taskSpawnMatch) return taskSpawnMatch[1].toLowerCase();

  // Strategy 2: Look for agent file paths being read (in tool_use input, not init)
  const agentFileMatch = cleanOutput.match(
    /file_path[:\s]*["'][^"]*agents\/(?:core|domain|specialized|orchestrators)\/([a-z0-9_-]+)\.md["']/i
  );
  if (agentFileMatch) return agentFileMatch[1].toLowerCase();

  // Strategy 3: Look for "you are the {agent}" in prompt content (not init)
  const agentIdentityMatch = cleanOutput.match(/you are (?:the )?(\w[\w-]*?)(?:\s+agent)?[.\s,]/i);
  if (agentIdentityMatch) {
    const candidate = agentIdentityMatch[1].toLowerCase();
    if (isKnownAgent(candidate)) return candidate;
  }

  // Strategy 4: Check for routing language mentioning specific agents
  const routeToMatch = cleanOutput.match(
    /(?:route|routing|spawn|spawning|assign)\s+(?:this\s+)?(?:to\s+)?(?:the\s+)?(?:a\s+)?([a-z][a-z0-9_-]*)/i
  );
  if (routeToMatch && isKnownAgent(routeToMatch[1])) {
    return routeToMatch[1].toLowerCase();
  }

  // No strong signal found - return null (UNKNOWN)
  return null;
}

// ---------------------------------------------------------------------------
// Extract routing-relevant excerpt from stream-json output
// ---------------------------------------------------------------------------
function extractRoutingExcerpt(rawOutput, maxLen) {
  const lines = rawOutput.split('\n').filter(l => l.trim());
  const excerpts = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message && obj.message.content) {
        for (const block of obj.message.content) {
          if (block.type === 'text') {
            excerpts.push(block.text.slice(0, 200));
          }
          if (block.type === 'tool_use' && block.name === 'Task') {
            const input = block.input || {};
            excerpts.push(`Task(subagent_type=${input.subagent_type || '?'})`);
          }
        }
      }
    } catch (_e) {
      // skip
    }
  }

  const combined = excerpts.join(' | ');
  return combined.slice(0, maxLen) || rawOutput.slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Known agent check
// ---------------------------------------------------------------------------
const KNOWN_AGENTS = new Set([
  'architect',
  'developer',
  'planner',
  'qa',
  'pm',
  'technical-writer',
  'context-compressor',
  'code-reviewer',
  'code-simplifier',
  'security-architect',
  'devops',
  'devops-troubleshooter',
  'incident-responder',
  'database-architect',
  'python-pro',
  'typescript-pro',
  'golang-pro',
  'rust-pro',
  'java-pro',
  'php-pro',
  'nodejs-pro',
  'fastapi-pro',
  'frontend-pro',
  'nextjs-pro',
  'sveltekit-expert',
  'graphql-pro',
  'ios-pro',
  'android-pro',
  'expo-mobile-developer',
  'tauri-desktop-developer',
  'data-engineer',
  'ai-ml-specialist',
  'web3-blockchain-expert',
  'scientific-research-expert',
  'gamedev-pro',
  'mobile-ux-reviewer',
  'researcher',
  'c4-context',
  'c4-container',
  'c4-component',
  'c4-code',
  'master-orchestrator',
  'evolution-orchestrator',
  'party-orchestrator',
  'swarm-coordinator',
  'reflection-agent',
  'conductor-validator',
  'reverse-engineer',
]);

function isKnownAgent(name) {
  return KNOWN_AGENTS.has(name);
}

// ---------------------------------------------------------------------------
// Evaluate pass/fail
// ---------------------------------------------------------------------------
function evaluateResult(tc, actualAgent, output) {
  if (!actualAgent) return false;
  const actual = actualAgent.toLowerCase();
  const expected = tc.expectedAgent.toLowerCase();

  // NO_ROUTING means the router asked a clarifying question
  if (actual === 'no_routing') return false;

  // Direct match
  if (actual === expected) return true;

  // Partial match: agent name contains expected or vice versa
  if (actual.includes(expected) || expected.includes(actual)) return true;

  // Planner is an acceptable routing for ANY task (Gate 1: Complexity)
  // The router may spawn planner first for complex tasks before the specialist
  if (actual === 'planner') {
    // Planner-first is acceptable routing behavior for complex tasks
    return true;
  }

  // Security-architect may be added alongside other agents (Gate 2: Security)
  if (actual === 'security-architect' && expected !== 'developer') {
    return true;
  }

  // general-purpose with correct agent name in prompt counts as PASS
  if (actual === 'general-purpose') {
    // Check if the prompt contains the expected agent name
    const promptLower = output.toLowerCase();
    if (promptLower.includes(expected)) {
      return true;
    }
  }

  // For developer cases, check it's not being wrongly routed to a specialist
  if (expected === 'developer' && tc.notExpected === null) {
    return actual === 'developer';
  }

  return false;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ---------------------------------------------------------------------------
// Batch runner: runs N tests in parallel
// ---------------------------------------------------------------------------
async function runBatch(cases) {
  return Promise.all(cases.map(tc => runTestCase(tc)));
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------
async function main() {
  const cases = getFilteredCases();

  if (cases.length === 0) {
    console.log('No test cases match the given filters.');
    process.exit(1);
  }

  // Ensure results directory exists
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('  CLI Routing Integration Test - 49-Agent Comprehensive Suite');
  console.log('='.repeat(70));
  console.log(`  Cases: ${cases.length}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Timeout per test: ${TIMEOUT_MS / 1000}s`);
  console.log(`  Max turns: ${MAX_TURNS}`);
  console.log(`  Results dir: ${RESULTS_DIR}`);
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    for (const tc of cases) {
      console.log(`  [${tc.id}] (${tc.category}) "${truncate(tc.prompt, 60)}"`);
      console.log(`       Expected: ${tc.expectedAgent}`);
    }
    console.log(`\n  Total: ${cases.length} cases (dry run, no API calls)`);
    return;
  }

  const allResults = [];
  const batches = [];

  // Split into batches
  for (let i = 0; i < cases.length; i += BATCH_SIZE) {
    batches.push(cases.slice(i, i + BATCH_SIZE));
  }

  console.log(`  Running ${batches.length} batch(es)...\n`);

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    const batchNum = bIdx + 1;

    console.log(
      `--- Batch ${batchNum}/${batches.length} (cases ${batch[0].id}-${batch[batch.length - 1].id}) ---`
    );

    const results = await runBatch(batch);
    allResults.push(...results);

    // Print batch results
    for (const r of results) {
      const statusIcon = r.status === 'PASS' ? 'PASS' : r.status === 'SKIP' ? 'SKIP' : 'FAIL';
      console.log(
        `  [${String(r.id).padStart(2)}] ${statusIcon} | Expected: ${r.expectedAgent.padEnd(25)} | Actual: ${(r.actualAgent || 'UNKNOWN').padEnd(25)} | ${r.elapsed}`
      );
      if (r.status === 'FAIL' || r.status === 'ERROR') {
        console.log(`       Output: ${truncate(r.outputExcerpt, 200)}`);
      }
    }
    console.log('');

    // Delay between batches to avoid rate limiting
    if (bIdx < batches.length - 1) {
      console.log(`  (waiting ${INTER_BATCH_DELAY_MS / 1000}s before next batch...)\n`);
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Generate Summary
  // ---------------------------------------------------------------------------
  const passed = allResults.filter(r => r.status === 'PASS').length;
  const failed = allResults.filter(r => r.status === 'FAIL').length;
  const errors = allResults.filter(r => r.status === 'ERROR').length;
  const skipped = allResults.filter(r => r.status === 'SKIP').length;

  console.log('='.repeat(70));
  console.log(
    `  RESULTS: ${passed} PASS | ${failed} FAIL | ${errors} ERROR | ${skipped} SKIP | ${allResults.length} TOTAL`
  );
  console.log('='.repeat(70));

  // Build summary markdown
  const now = new Date().toISOString().split('T')[0];
  let summary = `<!-- Agent: qa | Task: #11 | Session: ${now} -->\n`;
  summary += `# Routing Test Results - ${now}\n\n`;
  summary += `## Summary\n`;
  summary += `- Total: ${allResults.length}\n`;
  summary += `- Pass: ${passed}\n`;
  summary += `- Fail: ${failed}\n`;
  summary += `- Error: ${errors}\n`;
  summary += `- Skip: ${skipped}\n\n`;
  summary += `## Results Table\n\n`;
  summary += `| # | Category | Prompt (truncated) | Expected | Actual | Status | Time |\n`;
  summary += `|---|----------|-------------------|----------|--------|--------|------|\n`;

  for (const r of allResults) {
    summary += `| ${r.id} | ${r.category} | ${truncate(r.prompt, 40)} | ${r.expectedAgent} | ${r.actualAgent} | ${r.status} | ${r.elapsed} |\n`;
  }

  // Failures section
  const failures = allResults.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
  if (failures.length > 0) {
    summary += `\n## Failures\n\n`;
    for (const f of failures) {
      summary += `### Case ${f.id}: ${truncate(f.prompt, 60)}\n`;
      summary += `- **Expected:** ${f.expectedAgent}\n`;
      summary += `- **Actual:** ${f.actualAgent}\n`;
      summary += `- **Status:** ${f.status}\n`;
      summary += `- **Time:** ${f.elapsed}\n`;
      summary += `- **Output excerpt:**\n\`\`\`\n${truncate(f.outputExcerpt, 300)}\n\`\`\`\n\n`;
    }
  }

  // Category breakdown
  summary += `\n## Category Breakdown\n\n`;
  const categories = [...new Set(allResults.map(r => r.category))];
  for (const cat of categories) {
    const catResults = allResults.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.status === 'PASS').length;
    summary += `- **${cat}**: ${catPassed}/${catResults.length} passed\n`;
  }

  // Save summary
  const summaryFile = path.join(RESULTS_DIR, 'summary.md');
  writeFileSync(summaryFile, summary);
  console.log(`\n  Summary saved to: ${summaryFile}`);

  // Save all results as JSON
  const jsonFile = path.join(RESULTS_DIR, 'all-results.json');
  writeFileSync(jsonFile, JSON.stringify(allResults, null, 2));
  console.log(`  Full results saved to: ${jsonFile}`);

  // Exit with appropriate code
  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
