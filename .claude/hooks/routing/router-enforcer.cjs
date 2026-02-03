#!/usr/bin/env node
/**
 * Router Enforcer Hook
 *
 * Runs on UserPromptSubmit to:
 * 1. Parse hook input from Claude Code
 * 2. Analyze user prompt for routing recommendations
 * 3. Suggest appropriate agents based on intent
 *
 * Exit codes:
 * - 0: Allow (with optional suggestions printed)
 * - Non-zero: Block (not used currently, enforcement is advisory)
 */

const fs = require('fs');
const path = require('path');
const routerState = require('./router-state.cjs');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputSync } = require('../../lib/utils/hook-input.cjs');
const {
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
  DISAMBIGUATION_RULES,
} = require('../../lib/routing/routing-table.cjs');

const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

// BUG-NEW-006 FIX: Add module-level cache with TTL to prevent race conditions
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 300000; // 5 minutes

/**
 * Routing data lives in the shared routing-table module.
 * Keep CLAUDE.md routing table and routing-table.cjs in sync.
 */
// parseHookInput removed - now using parseHookInputSync from shared hook-input.cjs
// PERF-006/PERF-007: Eliminated ~10 lines of duplicated parsing code

/**
 * Load agent metadata from frontmatter
 * BUG-NEW-006 FIX: Uses TTL-based caching to prevent race conditions
 */
function loadAgents() {
  // Check cache first
  const now = Date.now();
  if (agentCache && now - agentCacheTime < AGENT_CACHE_TTL) {
    return agentCache;
  }

  const agents = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);
          if (frontmatter && frontmatter.name) {
            agents.push({
              name: frontmatter.name,
              description: frontmatter.description || '',
              skills: frontmatter.skills || [],
              priority: frontmatter.priority || 'medium',
              path: path.relative(PROJECT_ROOT, fullPath),
            });
          }
        } catch (_e) {
          // Skip invalid files
        }
      }
    }
  }

  scanDir(AGENTS_DIR);

  // Update cache
  agentCache = agents;
  agentCacheTime = now;

  return agents;
}

/**
 * Parse YAML frontmatter
 * BUG-NEW-007 FIX: Add size limit to prevent regex DoS
 */
function parseFrontmatter(content) {
  // BUG-NEW-007 FIX: Size limit to prevent regex DoS on large files
  if (!content || content.length > 50000) return null;

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  const lines = yaml.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim());
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.match(/^\s+-\s/)) {
      result[currentKey].push(line.replace(/^\s+-\s/, '').trim());
    }
  }

  return result;
}

/**
 * Detect if multi-agent planning is needed
 * Also classifies complexity and saves it to router-state
 *
 * Complexity Levels:
 *   - trivial: Greetings, simple questions, meta commands
 *   - low: Single-file fixes, typos, minor changes
 *   - medium: Multi-file changes, new components, features
 *   - high: Architecture, security, multi-agent tasks
 *   - epic: Major refactors, new systems, cross-cutting concerns
 */
function detectPlanningRequirement(prompt) {
  const promptLower = prompt.toLowerCase();

  // Keywords for trivial requests (greetings, questions)
  const trivialKeywords = [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'what is',
    'what are',
    'can you explain',
    'help me understand',
    'what does',
    'where is',
    'when did',
    'who is',
    'why does',
    'thanks',
    'thank you',
    'bye',
    'goodbye',
  ];

  // Keywords for low complexity (single-file, minor changes)
  const lowKeywords = [
    'typo',
    'fix typo',
    'rename',
    'update text',
    'change text',
    'fix bug',
    'small fix',
    'minor fix',
    'quick fix',
    'update config',
    'change config',
    'modify config',
  ];

  // Keywords that indicate multi-agent planning is needed
  const complexPlanningKeywords = [
    'review',
    'integrate',
    'integration',
    'migrate',
    'migration',
    'new feature',
    'implement',
    'add',
    'create',
    'codebase',
    'external',
    'third-party',
    'api',
    'auth',
    'authentication',
    'authorization',
    'security',
    'database',
    'schema',
    'migration',
    'architecture',
    'refactor',
    'redesign',
    'plan',
    'proposal',
    'rfc',
    'design',
    'investigate',
    'analyze',
    'debug',
    'troubleshoot',
    'enforcement',
    'hook',
    'guard',
    'protocol',
    'violation',
    'diagnose',
    'root cause',
    'why.*not working',
    'broken',
    // Workflow-related keywords that indicate multi-step coordination
    'workflow',
    'orchestrat',
    'multi-step',
    'multi-file',
    'across',
    'coordinate',
    'sequence',
    'phase',
    'end-to-end',
    'e2e',
    'full-stack',
    'cross-cutting',
    'systematic',
    'comprehensive',
    'overhaul',
    'restructure',
    'planning',
    'design doc',
    'specification',
    'requirements',
  ];

  // Keywords that indicate security review is mandatory
  const securityMandatoryKeywords = [
    'auth',
    'authentication',
    'authorization',
    'login',
    'password',
    'token',
    'jwt',
    'oauth',
    'security',
    'permission',
    'role',
    'encrypt',
    'credential',
    'secret',
    'api key',
    'payment',
    'financial',
  ];

  // Keywords that indicate architect review is needed
  const architectKeywords = [
    'integrate',
    'integration',
    'api',
    'database',
    'schema',
    'refactor',
    'architecture',
    'pattern',
    'structure',
    'scale',
    'migrate',
    'migration',
    'external',
    'codebase',
  ];

  // Keywords for epic complexity (major undertakings)
  const epicKeywords = [
    'rewrite',
    'rebuild',
    'major refactor',
    'new system',
    'microservice',
    'monolith',
    'platform',
    'framework',
    'multi-tenant',
    'multi-region',
    'distributed',
    'audit',
    'comprehensive review',
    'all hooks',
    'all agents',
    'all workflows',
    'all skills',
    'framework',
    'system-wide',
    'entire codebase',
    'everything',
  ];

  // Multi-scope patterns that MUST trigger EPIC complexity
  // These patterns indicate requests spanning multiple framework domains
  const multiScopePatterns = [
    /\ball\b.*\b(review|audit|check|validate)/i,
    /\b(review|audit|check)\b.*\ball\b/i,
    /multiple.*(agent|review|audit)/i,
    /(agents|workflows|hooks|skills|schemas).*and.*(agents|workflows|hooks|skills|schemas)/i,
    /etc\./i, // Enumeration indicator (e.g., "hooks, commands, etc.")
    /deep dive.*everything/i,
    /\ball\s+other\s+items/i, // "all other items"
    /\beverything\b.*\b(review|audit|check)/i,
    /\b(review|audit|check)\b.*\beverything\b/i,
  ];

  // Domain keywords for multi-domain detection
  const domainKeywords = [
    'router',
    'workflow',
    'hook',
    'skill',
    'agent',
    'schema',
    'memory',
    'command',
    'template',
    'config',
    'context',
  ];

  // Count matches
  const trivialMatches = trivialKeywords.filter(k => promptLower.includes(k)).length;
  const lowMatches = lowKeywords.filter(k => promptLower.includes(k)).length;
  const complexMatches = complexPlanningKeywords.filter(k => promptLower.includes(k)).length;
  const securityMatches = securityMandatoryKeywords.filter(k => promptLower.includes(k)).length;
  const architectMatches = architectKeywords.filter(k => promptLower.includes(k)).length;
  const epicMatches = epicKeywords.filter(k => promptLower.includes(k)).length;

  // Check multi-scope patterns (any match = EPIC)
  const multiScopeMatch = multiScopePatterns.some(pattern => pattern.test(prompt));

  // Count domain keyword matches for multi-domain detection
  const domainMatches = domainKeywords.filter(k => promptLower.includes(k)).length;

  // Word count analysis for verbose multi-scope requests
  const wordCount = prompt.split(/\s+/).length;

  // Determine complexity level
  let complexity = 'trivial'; // Default to trivial
  let requiresArchitectReview = false;
  let requiresSecurityReview = false;

  // EPIC complexity triggers (checked first, highest priority)
  // 1. Explicit multi-scope pattern match
  // 2. Multiple domains mentioned (4+)
  // 3. High word count combined with complex keywords
  // 4. Original epic keywords
  if (
    multiScopeMatch ||
    domainMatches >= 4 ||
    (wordCount > 30 && complexMatches >= 1) ||
    epicMatches >= 1 ||
    (architectMatches >= 2 && complexMatches >= 3)
  ) {
    complexity = 'epic';
    requiresArchitectReview = true;
  }
  // High complexity: architecture, security, multi-agent
  else if (complexMatches >= 2 || securityMatches >= 1 || architectMatches >= 2) {
    complexity = 'high';
    requiresArchitectReview = architectMatches >= 1 || complexMatches >= 2;
  }
  // Medium complexity: multi-file changes, features
  else if (complexMatches >= 1 || architectMatches >= 1) {
    complexity = 'medium';
  }
  // Low complexity: single-file fixes, minor changes
  else if (lowMatches >= 1 || (prompt.length > 20 && trivialMatches === 0)) {
    complexity = 'low';
  }
  // Trivial: greetings, questions (default, or explicit match)
  // Already set to 'trivial' by default

  // Security flag
  if (securityMatches >= 1) {
    requiresSecurityReview = true;
  }

  // Investigation patterns always require PLANNER
  const investigationPatterns = [
    /investigat.*why/i,
    /why.*not.*working/i,
    /debug.*enforcement/i,
    /fix.*hook/i,
    /router.*broken/i,
    /enforcement.*fail/i,
  ];
  if (investigationPatterns.some(p => p.test(prompt))) {
    complexity = 'high';
  }

  // Save complexity to router-state
  routerState.setComplexity(complexity);
  if (requiresSecurityReview) {
    routerState.setSecurityRequired(true);
  }

  return {
    complexity,
    requiresArchitectReview,
    requiresSecurityReview,
    multiAgentRequired: requiresArchitectReview || requiresSecurityReview,
  };
}

/**
 * Intent keywords for all 41 agents
 * Source: Research reports in .claude/context/artifacts/research-reports/agent-keywords-*.md
 *
 * Categories:
 * - Core Agents (8): architect, context_compressor, developer, planner, pm, qa, router, documentation
 * - Domain Languages (6): python, rust, golang, typescript, java, php
 * - Domain Frameworks (8): fastapi, nextjs, sveltekit, nodejs, expo, tauri, ios, graphql
 * - Domain Other (3): frontend, data_engineer, mobile_ux
 * - Specialized (12): c4_code, c4_component, c4_container, c4_context, code_reviewer,
 *                     conductor_validator, database_architect, devops, devops_troubleshooter,
 *                     incident_responder, reverse_engineer, security_architect
 * - Orchestrators (3): master_orchestrator, swarm_coordinator, evolution_orchestrator
 */
/**
 * Intent-to-Agent mapping for deterministic routing
 * Maps detected intent keys to agent names
 */
/**
 * Disambiguation rules for overlapping keywords
 * When multiple agents score similarly, these rules help break ties
 *
 * Format: { keyword: [{ condition: [contextKeywords], prefer: agentName, deprioritize: agentName }] }
 */
/**
 * Apply disambiguation rules to adjust agent scores
 * @param {string} promptLower - lowercase user prompt
 * @param {Array} candidates - array of {agent, score} objects
 * @returns {Array} - adjusted candidates array
 */
function applyDisambiguation(promptLower, candidates) {
  // Find which disambiguation keywords are in the prompt
  for (const [keyword, rules] of Object.entries(DISAMBIGUATION_RULES)) {
    if (!promptLower.includes(keyword)) continue;

    // Check each rule for this keyword
    for (const rule of rules) {
      const hasCondition = rule.condition.some(c => promptLower.includes(c));
      if (!hasCondition) continue;

      // Apply score adjustments
      for (const candidate of candidates) {
        if (candidate.agent.name === rule.prefer) {
          candidate.score += 3; // Boost preferred agent
          candidate.disambiguated = true;
        } else if (candidate.agent.name === rule.deprioritize) {
          candidate.score -= 1; // Slight penalty for deprioritized
          candidate.disambiguated = true;
        }
      }
    }
  }

  // Re-sort after disambiguation
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Score agents against user prompt using comprehensive intent detection
 */
function scoreAgents(prompt, agents) {
  const promptLower = prompt.toLowerCase();
  const scores = [];

  // Detect all matching intents with their scores
  const intentScores = {};
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const matchCount = keywords.filter(k => promptLower.includes(k)).length;
    if (matchCount > 0) {
      intentScores[intent] = matchCount;
    }
  }

  // Find primary intent (highest scoring)
  let detectedIntent = 'general';
  let maxIntentScore = 0;
  for (const [intent, score] of Object.entries(intentScores)) {
    if (score > maxIntentScore) {
      maxIntentScore = score;
      detectedIntent = intent;
    }
  }

  // Get preferred agent for the detected intent
  const preferredAgentName = INTENT_TO_AGENT[detectedIntent] || null;

  // Score each agent
  for (const agent of agents) {
    let score = 0;
    const agentDesc = (agent.description + ' ' + agent.name).toLowerCase();
    const _agentName = agent.name.toLowerCase();

    // Match by description keywords
    const promptWords = promptLower.split(/\s+/);
    for (const word of promptWords) {
      if (word.length > 3 && agentDesc.includes(word)) {
        score += 1;
      }
    }

    // Direct intent-to-agent match (highest priority - +5 boost)
    if (preferredAgentName && agent.name === preferredAgentName) {
      score += 5;
    }

    // Secondary intent matches (check all detected intents)
    for (const [intent, intentScore] of Object.entries(intentScores)) {
      const mappedAgent = INTENT_TO_AGENT[intent];
      if (mappedAgent && agent.name === mappedAgent && intent !== detectedIntent) {
        // Secondary matches get smaller boost scaled by their score
        score += Math.min(3, intentScore);
      }
    }

    // Domain-specific routing boosts for high-confidence matches
    // These ensure domain experts are preferred for their specific technologies
    const domainBoosts = {
      // Languages (python-pro for general Python development)
      'python-pro': [
        'python',
        '.py',
        'django',
        'flask',
        'pytest',
        'pip',
        'poetry',
        'pandas',
        'numpy',
        'asyncio',
        'pydantic',
        'sqlalchemy',
        'celery',
        'virtualenv',
        'venv',
        'conda',
        'pyproject.toml',
        'requirements.txt',
        'type hints',
        'mypy',
        'dataclasses',
      ],
      'rust-pro': ['rust', '.rs', 'cargo', 'tokio', 'ownership', 'borrowing'],
      'golang-pro': ['golang', '.go', 'goroutine', 'go mod', 'gin', 'echo'],
      'typescript-pro': ['typescript', '.ts', '.tsx', 'tsconfig', 'tsc'],
      'java-pro': ['java', '.java', 'spring boot', 'maven', 'gradle', 'jpa'],
      'php-pro': ['php', '.php', 'laravel', 'symfony', 'composer', 'eloquent'],
      // Frameworks
      'fastapi-pro': ['fastapi', 'pydantic', 'uvicorn', 'starlette'],
      'nextjs-pro': ['nextjs', 'next.js', 'app router', 'server components'],
      'sveltekit-expert': ['svelte', 'sveltekit', 'runes', '$state', '$derived'],
      'nodejs-pro': ['node.js', 'nodejs', 'express', 'nestjs'],
      'expo-mobile-developer': ['expo', 'react native', 'eas build'],
      'tauri-desktop-developer': ['tauri', 'desktop app', 'electron alternative'],
      'ios-pro': ['ios', 'swift', 'swiftui', 'xcode', 'uikit'],
      'android-pro': [
        'android',
        'kotlin',
        'jetpack',
        'jetpack compose',
        'compose',
        'material design',
        'material3',
        'room',
        'hilt',
        'dagger',
        'viewmodel',
        'stateflow',
        'android studio',
        'gradle',
        'play store',
        'firebase android',
        'coroutines',
        'kotlin flow',
      ],
      'graphql-pro': [
        'graphql',
        'gql',
        'apollo',
        'apollo server',
        'apollo client',
        'resolver',
        'mutation',
        'subscription',
        'federation',
        'supergraph',
        'subgraph',
        'hasura',
        'relay',
        'urql',
        'graphql-codegen',
        'introspection',
        'fragment',
        'directive',
      ],
      // Domain other
      'frontend-pro': ['react', 'vue', 'tailwind', 'shadcn', 'component'],
      'data-engineer': [
        'etl',
        'data pipeline',
        'airflow',
        'dbt',
        'data warehouse',
        // Data Science keywords
        'data science',
        'data analysis',
        'analytics',
        'big data',
        'spark',
        'hadoop',
        'data cleaning',
        'data wrangling',
        'exploratory analysis',
        'eda',
        'visualization',
        'dashboard',
        'reporting',
        'a/b testing',
        'experimentation',
      ],
      'mobile-ux-reviewer': ['ux review', 'mobile ux', 'heuristic evaluation'],
      // Scientific research expert (dedicated agent for computational biology, cheminformatics)
      'scientific-research-expert': [
        'scientific',
        'science',
        'research',
        'laboratory',
        'lab',
        'chemistry',
        'chemical',
        'molecule',
        'compound',
        'rdkit',
        'cheminformatics',
        'biology',
        'bioinformatics',
        'genomics',
        'gene',
        'protein',
        'dna',
        'rna',
        'scanpy',
        'single-cell',
        'rna-seq',
        'sequence',
        'sequencing',
        'drug discovery',
        'pharma',
        'pharmaceutical',
        'clinical',
        'medical',
        'literature review',
        'pubmed',
        'hypothesis',
        'scientific writing',
        'biopython',
        'chembl',
        'uniprot',
        'pdb',
        'pubchem',
        'mass spectrometry',
        'metabolomics',
        'proteomics',
        'transcriptomics',
        'clinical trials',
        'fda',
        'regulatory',
        'prisma',
        'systematic review',
        'opentrons',
        'benchling',
        'lamindb',
        'anndata',
        'deepchem',
      ],
      // AI/ML specialist (dedicated agent for ML/DL, MLOps, model deployment)
      'ai-ml-specialist': [
        'machine learning',
        'deep learning',
        'neural network',
        'model training',
        'tensorflow',
        'pytorch',
        'keras',
        'scikit-learn',
        'sklearn',
        'huggingface',
        'transformer',
        'llm',
        'embedding',
        'fine-tuning',
        'xgboost',
        'lightgbm',
        'catboost',
        'feature engineering',
        'classification',
        'regression',
        'clustering',
        'nlp',
        'computer vision',
        'mlops',
        'mlflow',
        'weights and biases',
        'wandb',
        'experiment tracking',
        'model serving',
        'torchserve',
        'kserve',
        'bentoml',
        'inference',
        'hyperparameter',
        'cross-validation',
        'overfitting',
        'regularization',
        'onnx',
        'tensorrt',
        'quantization',
        'model optimization',
        'distributed training',
        'gpu training',
        'cuda',
        'data augmentation',
      ],
      // Game development
      'gamedev-pro': [
        'game',
        'game development',
        'gamedev',
        'game engine',
        'unity',
        'unreal',
        'godot',
        'ecs',
        'entity component system',
        'game loop',
        'game physics',
        'shader',
        'sprite',
        'collision',
        'physics engine',
        'multiplayer',
        'netcode',
        'game ai',
        'pathfinding',
        'behavior tree',
        'game state',
        'level design',
        'procedural generation',
        'fps',
        'frame rate',
        'gpu',
        'rendering',
      ],
      // Specialized
      'security-architect': ['security', 'threat model', 'owasp', 'vulnerability', 'stride'],
      'incident-responder': ['incident', 'outage', 'sre', 'on-call', 'postmortem'],
      devops: ['kubernetes', 'docker', 'ci/cd', 'terraform', 'pipeline'],
      'devops-troubleshooter': ['troubleshoot', 'debug', 'logs', 'rca', 'investigate'],
      'database-architect': ['database', 'schema', 'migration', 'query optimization'],
      'code-reviewer': ['code review', 'pr review', 'pull request', 'merge approval'],
      'code-simplifier': ['simplify', 'clean up', 'refactor for clarity', 'reduce complexity'],
      'technical-writer': [
        'documentation',
        'docs',
        'readme',
        'readme.md',
        'guide',
        'tutorial',
        'api documentation',
        'jsdoc',
        'typedoc',
        'markdown',
        'md file',
        'technical writing',
        'user guide',
        'developer guide',
        'getting started',
        'changelog',
        'release notes',
        'openapi',
        'swagger',
        'docusaurus',
        'mkdocs',
        'sphinx',
        'generate docs',
        'document this',
        'write doc',
      ],
      // Web3/Blockchain
      'web3-blockchain-expert': [
        'web3',
        'blockchain',
        'smart contract',
        'solidity',
        'ethereum',
        'defi',
        'nft',
        'erc-20',
        'erc-721',
        'hardhat',
        'foundry',
        'openzeppelin',
        'reentrancy',
        'gas optimization',
        'metamask',
        'polygon',
        'arbitrum',
        'optimism',
        'uniswap',
        'aave',
        'staking',
        'flash loan',
        'chainlink',
        'proxy contract',
        'upgradeable',
        'vyper',
        'cairo',
        'slither',
        'mythril',
        'tokenomics',
        'dao',
      ],
    };

    // Apply domain-specific boosts
    const agentBoostKeywords = domainBoosts[agent.name];
    if (agentBoostKeywords) {
      const boostMatches = agentBoostKeywords.filter(k => promptLower.includes(k)).length;
      if (boostMatches > 0) {
        score += Math.min(4, boostMatches * 2); // Up to +4 for domain matches
      }
    }

    // Priority boost
    if (agent.priority === 'high') score += 1;

    scores.push({ agent, score, intent: detectedIntent });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Apply disambiguation rules when top agents have close scores
  let candidates = scores.slice(0, 5); // Get top 5 for disambiguation
  if (candidates.length >= 2 && candidates[0].score - candidates[1].score < 3) {
    // Close scores - apply disambiguation
    candidates = applyDisambiguation(promptLower, candidates);
  }

  return { candidates: candidates.slice(0, 3), intent: detectedIntent };
}

/**
 * Main execution
 */
function main() {
  // PERF-006/PERF-007: Use shared hook-input.cjs utility
  const hookInput = parseHookInputSync();

  // Get the user prompt
  let userPrompt = '';
  if (hookInput && hookInput.prompt) {
    userPrompt = hookInput.prompt;
  } else if (hookInput && hookInput.message) {
    userPrompt = hookInput.message;
  }

  // Skip routing suggestions for very short prompts or meta commands
  if (!userPrompt || userPrompt.length < 10) {
    process.exit(0);
  }

  // Skip for slash commands (handled by skill system)
  if (userPrompt.trim().startsWith('/')) {
    process.exit(0);
  }

  // Load agents and score
  const agents = loadAgents();
  if (agents.length === 0) {
    // No agents found, skip routing
    process.exit(0);
  }

  const { candidates, intent } = scoreAgents(userPrompt, agents);
  const planningReq = detectPlanningRequirement(userPrompt);

  // Only show routing info if we have a clear recommendation
  if (candidates.length > 0 && candidates[0].score > 2) {
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│ 🔀 ROUTER ANALYSIS                              │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│ Intent: ${intent.padEnd(39)} │`);
    console.log(`│ Complexity: ${planningReq.complexity.padEnd(36)} │`);
    console.log('│ Recommended agents:                             │');
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const c = candidates[i];
      if (c.score > 0) {
        const line = `│  ${i + 1}. ${c.agent.name} (score: ${c.score})`.padEnd(50) + '│';
        console.log(line);
      }
    }

    // Show multi-agent planning requirements
    if (planningReq.multiAgentRequired) {
      console.log('├─────────────────────────────────────────────────┤');
      console.log('│ ⚠️  MULTI-AGENT PLANNING REQUIRED               │');
      if (planningReq.requiresArchitectReview) {
        console.log('│  → Architect review: REQUIRED                   │');
      }
      if (planningReq.requiresSecurityReview) {
        console.log('│  → Security review: REQUIRED                    │');
      }
      console.log('│                                                 │');
      console.log('│ Phases: Explore → Plan → Review → Consolidate  │');
    }

    console.log('│                                                 │');
    console.log('│ Use Task tool to spawn: ' + candidates[0].agent.name.padEnd(24) + '│');
    console.log('└─────────────────────────────────────────────────┘\n');
  }

  // Always allow (advisory mode)
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
