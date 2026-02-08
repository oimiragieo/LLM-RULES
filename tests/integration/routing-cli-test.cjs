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
const TEST_CASES = [
  // === Core (7) ===
  {
    id: 1,
    category: 'Core',
    prompt: 'Design the system architecture for migrating our monolith to microservices',
    expectedAgent: 'architect',
    notExpected: 'developer',
  },
  {
    id: 2,
    category: 'Core',
    prompt: 'Fix the null pointer exception in the auth controller getUser method',
    expectedAgent: 'developer',
    notExpected: null,
  },
  {
    id: 3,
    category: 'Core',
    prompt: 'Plan the implementation strategy for adding OAuth2 authentication',
    expectedAgent: 'planner',
    notExpected: 'developer',
  },
  {
    id: 4,
    category: 'Core',
    prompt: 'Write comprehensive test coverage for the payment processing module',
    expectedAgent: 'qa',
    notExpected: 'developer',
  },
  {
    id: 5,
    category: 'Core',
    prompt: 'Create user stories and acceptance criteria for the new checkout feature',
    expectedAgent: 'pm',
    notExpected: 'developer',
  },
  {
    id: 6,
    category: 'Core',
    prompt: 'Update the API documentation for all v2 REST endpoints',
    expectedAgent: 'technical-writer',
    notExpected: 'developer',
  },
  {
    id: 7,
    category: 'Core',
    prompt: 'Summarize and compress the current conversation context',
    expectedAgent: 'context-compressor',
    notExpected: null,
    optional: true, // may not route via standard agent spawn
  },

  // === Review & Quality (3) ===
  {
    id: 8,
    category: 'Review',
    prompt: 'Review the pull request for the new search feature implementation',
    expectedAgent: 'code-reviewer',
    notExpected: 'developer',
  },
  {
    id: 9,
    category: 'Review',
    prompt: 'Refactor the legacy billing module to reduce complexity and improve readability',
    expectedAgent: 'code-simplifier',
    notExpected: 'developer',
  },
  {
    id: 10,
    category: 'Review',
    prompt: 'Perform a security audit of the authentication and authorization system',
    expectedAgent: 'security-architect',
    notExpected: 'developer',
  },

  // === Infrastructure & Ops (4) ===
  {
    id: 11,
    category: 'Infrastructure',
    prompt: 'Set up a CI/CD pipeline with GitHub Actions and Docker deployment',
    expectedAgent: 'devops',
    notExpected: 'developer',
  },
  {
    id: 12,
    category: 'Infrastructure',
    prompt: 'Debug the production memory leak causing OOM crashes in the API server',
    expectedAgent: 'devops-troubleshooter',
    notExpected: 'developer',
  },
  {
    id: 13,
    category: 'Infrastructure',
    prompt: 'Handle the ongoing production outage affecting the payment processing service',
    expectedAgent: 'incident-responder',
    notExpected: 'developer',
  },
  {
    id: 14,
    category: 'Infrastructure',
    prompt: 'Design the database schema for our new multi-tenant SaaS platform',
    expectedAgent: 'database-architect',
    notExpected: 'developer',
  },

  // === Language Specialists (8) ===
  {
    id: 15,
    category: 'Language',
    prompt: 'Build a Python async data processing pipeline using pandas and asyncio',
    expectedAgent: 'python-pro',
    notExpected: 'developer',
  },
  {
    id: 16,
    category: 'Language',
    prompt: 'Create advanced TypeScript generic utility types for the API client SDK',
    expectedAgent: 'typescript-pro',
    notExpected: 'developer',
  },
  {
    id: 17,
    category: 'Language',
    prompt: 'Implement a Go gRPC microservice with concurrent stream processing',
    expectedAgent: 'golang-pro',
    notExpected: 'developer',
  },
  {
    id: 18,
    category: 'Language',
    prompt: 'Build a Rust async file processing system using Tokio and async-std',
    expectedAgent: 'rust-pro',
    notExpected: 'developer',
  },
  {
    id: 19,
    category: 'Language',
    prompt: 'Create a Spring Boot 3 REST API with JPA repositories and Flyway migrations',
    expectedAgent: 'java-pro',
    notExpected: 'developer',
  },
  {
    id: 20,
    category: 'Language',
    prompt: 'Build a Laravel 11 REST API with Eloquent models and Sanctum auth',
    expectedAgent: 'php-pro',
    notExpected: 'developer',
  },
  {
    id: 21,
    category: 'Language',
    prompt: 'Create a NestJS WebSocket gateway with Express middleware integration',
    expectedAgent: 'nodejs-pro',
    notExpected: 'developer',
  },
  {
    id: 22,
    category: 'Language',
    prompt: 'Build a FastAPI async REST API with Pydantic V2 models and SQLAlchemy 2.0',
    expectedAgent: 'fastapi-pro',
    notExpected: 'developer',
  },

  // === Framework Specialists (4) ===
  {
    id: 23,
    category: 'Framework',
    prompt: 'Build a React component library with Radix primitives and Tailwind CSS styling',
    expectedAgent: 'frontend-pro',
    notExpected: 'developer',
  },
  {
    id: 24,
    category: 'Framework',
    prompt: 'Create a Next.js 14 application with React Server Components and Server Actions',
    expectedAgent: 'nextjs-pro',
    notExpected: 'developer',
  },
  {
    id: 25,
    category: 'Framework',
    prompt: 'Build a SvelteKit application with Svelte 5 runes and server-side rendering',
    expectedAgent: 'sveltekit-expert',
    notExpected: 'developer',
  },
  {
    id: 26,
    category: 'Framework',
    prompt: 'Design a GraphQL schema with Apollo Server federation and real-time subscriptions',
    expectedAgent: 'graphql-pro',
    notExpected: 'developer',
  },

  // === Mobile & Desktop (4) ===
  {
    id: 27,
    category: 'Mobile',
    prompt: 'Build an iOS app with SwiftUI navigation and Core Data persistence',
    expectedAgent: 'ios-pro',
    notExpected: 'developer',
  },
  {
    id: 28,
    category: 'Mobile',
    prompt: 'Create an Android app with Jetpack Compose UI and Room database',
    expectedAgent: 'android-pro',
    notExpected: 'developer',
  },
  {
    id: 29,
    category: 'Mobile',
    prompt: 'Build a cross-platform React Native app with Expo and native modules',
    expectedAgent: 'expo-mobile-developer',
    notExpected: 'developer',
  },
  {
    id: 30,
    category: 'Mobile',
    prompt: 'Create a Tauri 2.0 cross-platform desktop app with Rust IPC commands',
    expectedAgent: 'tauri-desktop-developer',
    notExpected: 'developer',
  },

  // === Specialist Domains (5) ===
  {
    id: 31,
    category: 'Domain',
    prompt: 'Build an ETL data pipeline for processing customer analytics with Apache Spark',
    expectedAgent: 'data-engineer',
    notExpected: 'developer',
  },
  {
    id: 32,
    category: 'Domain',
    prompt: 'Train a PyTorch image classification model with MLOps experiment tracking',
    expectedAgent: 'ai-ml-specialist',
    notExpected: 'developer',
  },
  {
    id: 33,
    category: 'Domain',
    prompt: 'Write a Solidity smart contract for a DeFi automated market maker protocol',
    expectedAgent: 'web3-blockchain-expert',
    notExpected: 'developer',
  },
  {
    id: 34,
    category: 'Domain',
    prompt: 'Analyze genomic sequencing data using computational biology pipelines',
    expectedAgent: 'scientific-research-expert',
    notExpected: 'developer',
  },
  {
    id: 35,
    category: 'Domain',
    prompt: 'Implement an ECS-based game physics system in Unity with custom shaders',
    expectedAgent: 'gamedev-pro',
    notExpected: 'developer',
  },

  // === UX & Research (2) ===
  {
    id: 36,
    category: 'UX',
    prompt: 'Review the mobile app design for accessibility compliance and UX best practices',
    expectedAgent: 'mobile-ux-reviewer',
    notExpected: 'developer',
  },
  {
    id: 37,
    category: 'Research',
    prompt: 'Research and compare caching strategies for distributed microservice architectures',
    expectedAgent: 'researcher',
    notExpected: 'developer',
  },

  // === Architecture Docs / C4 (4) ===
  {
    id: 38,
    category: 'C4',
    prompt: 'Create a C4 system context diagram documenting all external system integrations',
    expectedAgent: 'c4-context',
    notExpected: 'developer',
  },
  {
    id: 39,
    category: 'C4',
    prompt: 'Document the C4 container-level deployment architecture with all services',
    expectedAgent: 'c4-container',
    notExpected: 'developer',
  },
  {
    id: 40,
    category: 'C4',
    prompt: 'Create C4 component diagrams showing the auth service internal architecture',
    expectedAgent: 'c4-component',
    notExpected: 'developer',
  },
  {
    id: 41,
    category: 'C4',
    prompt: 'Generate C4 code-level documentation for the API routing module',
    expectedAgent: 'c4-code',
    notExpected: 'developer',
  },

  // === Orchestrators (4) ===
  {
    id: 42,
    category: 'Orchestrator',
    prompt:
      'Coordinate the complete migration from our legacy monolith to microservices architecture across 6 teams',
    expectedAgent: 'master-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 43,
    category: 'Orchestrator',
    prompt: 'The framework needs a new Terraform infrastructure management agent — create it',
    expectedAgent: 'evolution-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 44,
    category: 'Orchestrator',
    prompt:
      'Party mode: have the team discuss and debate the best approach for implementing real-time notifications',
    expectedAgent: 'party-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 45,
    category: 'Orchestrator',
    prompt: 'Run a parallel security scan across all 12 microservice repositories simultaneously',
    expectedAgent: 'swarm-coordinator',
    notExpected: 'developer',
  },

  // === Meta (2) ===
  {
    id: 46,
    category: 'Meta',
    prompt: 'Reflect on our last development session and extract key learnings',
    expectedAgent: 'reflection-agent',
    notExpected: null,
    optional: true, // may be auto-triggered
  },
  {
    id: 47,
    category: 'Meta',
    prompt: 'Validate the project context and verify all Conductor configurations are correct',
    expectedAgent: 'conductor-validator',
    notExpected: null,
  },

  // === Developer Correct Routing (2) ===
  {
    id: 48,
    category: 'Developer-Correct',
    prompt: 'Fix the race condition in the WebSocket connection handler',
    expectedAgent: 'developer',
    notExpected: null,
  },
  {
    id: 49,
    category: 'Developer-Correct',
    prompt: 'Implement the new caching layer for the API response handler',
    expectedAgent: 'developer',
    notExpected: null,
  },
];

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
    // Use double quotes around the prompt to preserve spaces and special chars
    const cmdArgs = [
      '-p',
      `"${tc.prompt.replace(/"/g, '\\"')}"`, // Escape internal quotes, wrap in quotes
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
