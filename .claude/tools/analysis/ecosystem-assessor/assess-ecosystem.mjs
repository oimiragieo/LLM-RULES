#!/usr/bin/env node

/**
 * Ecosystem Assessor - Main Orchestrator
 *
 * Combines hook assessment and MCP discovery to provide
 * comprehensive ecosystem integration recommendations.
 *
 * Usage:
 *   node assess-ecosystem.mjs --name "agent-name" --description "description"
 *   node assess-ecosystem.mjs --type skill --name "skill-name" --description "..."
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { assessHooks, generateHookContent } from './hook-assessor.mjs';
import { discoverMcpMatches, getMcpToolsRef, getConversionCommand } from './mcp-discoverer.mjs';
import { ecosystemHealthCheck as runEcosystemHealthCheck } from './ecosystem-health.mjs';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../../../lib/utils/atomic-write.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find project root (Windows compatible)
function findProjectRoot() {
  let dir = __dirname;
  let prevDir = '';
  while (dir !== prevDir) {
    // Stop when we reach the root (dirname returns same path)
    // Check if this directory contains a .claude folder (project root)
    if (existsSync(join(dir, '.claude'))) return dir;
    prevDir = dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const HOOKS_DIR = join(ROOT, '.claude', 'hooks');
const SETTINGS_PATH = join(ROOT, '.claude', 'settings.json');

/**
 * Full ecosystem assessment for an agent or skill
 *
 * @param {Object} config - Configuration
 * @param {string} config.type - 'agent' or 'skill'
 * @param {string} config.name - Name
 * @param {string} config.description - Description
 * @param {string[]} [config.capabilities] - Capabilities
 * @param {string[]} [config.keywords] - Additional keywords
 * @returns {Object} Full assessment results
 */
export function assessEcosystem(config) {
  const { type = 'agent', name, description, capabilities = [], keywords = [] } = config;

  // Run both assessments
  const hookAssessment = assessHooks({ name, description, capabilities, keywords });
  const mcpAssessment =
    type === 'agent'
      ? discoverMcpMatches({ name, description, capabilities })
      : { hasMatches: false, matches: [] };

  // Combine recommendations
  const recommendations = {
    hooks: hookAssessment.recommendations.filter(r => !r.alreadyExists),
    mcpServers: mcpAssessment.matches || [],
    skillsToCreate: [],
    agentUpdates: [],
  };

  // Identify skills that need to be created
  if (mcpAssessment.matches) {
    for (const match of mcpAssessment.matches) {
      if (match.needsSkillCreation) {
        recommendations.skillsToCreate.push({
          forMcp: match.server,
          suggestedNames: match.suggestedSkills,
          command: getConversionCommand(match.server),
        });
      }
    }
  }

  // Calculate priority scores
  const criticalHooks = recommendations.hooks.filter(h => h.priority === 'critical').length;
  const highPriorityHooks = recommendations.hooks.filter(h => h.priority === 'high').length;
  const mcpMatches = recommendations.mcpServers.filter(m => m.score >= 1).length;

  return {
    type,
    name,
    summary: {
      hasRecommendations: recommendations.hooks.length > 0 || mcpMatches > 0,
      criticalItems: criticalHooks,
      highPriorityItems: highPriorityHooks + mcpMatches,
      totalRecommendations: recommendations.hooks.length + mcpMatches,
    },
    hookAssessment,
    mcpAssessment,
    recommendations,
    actions: generateActionPlan(recommendations, config),
  };
}

/**
 * Generate action plan from recommendations
 */
function generateActionPlan(recommendations, config) {
  const actions = [];

  // Hook actions
  for (const hook of recommendations.hooks) {
    if (hook.priority === 'critical' || hook.priority === 'high') {
      actions.push({
        type: 'create-hook',
        priority: hook.priority,
        description: `Create ${hook.type} hook: ${hook.purpose}`,
        template: hook.template,
        auto: false, // Hooks should be reviewed, not auto-created
      });
    }
  }

  // MCP skill creation actions
  for (const skill of recommendations.skillsToCreate) {
    actions.push({
      type: 'create-skill',
      priority: 'medium',
      description: `Create skill for MCP server: ${skill.forMcp}`,
      command: skill.command,
      auto: true,
    });
  }

  // MCP tool reference actions
  for (const match of recommendations.mcpServers) {
    if (match.existingSkill) {
      actions.push({
        type: 'add-skill',
        priority: 'low',
        description: `Add skill ${match.existingSkill.name} to ${config.type}`,
        skillName: match.existingSkill.name,
        auto: true,
      });
    } else if (!match.needsSkillCreation) {
      // Direct MCP tool reference (for built-in like filesystem)
      actions.push({
        type: 'add-mcp-ref',
        priority: 'low',
        description: `Add MCP tools reference: ${match.toolPrefix}*`,
        toolRef: getMcpToolsRef(match.server),
        auto: true,
      });
    }
  }

  return actions.sort((a, b) => {
    const priority = { critical: 0, high: 1, medium: 2, low: 3 };
    return (priority[a.priority] || 3) - (priority[b.priority] || 3);
  });
}

/**
 * Create a hook file from template
 */
export function createHookFile(templateName, hookName, category = 'custom') {
  const content = generateHookContent(templateName);
  if (!content) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const hookDir = join(HOOKS_DIR, category);
  mkdirSync(hookDir, { recursive: true });

  const hookPath = join(hookDir, `${hookName}.cjs`);
  writeFileSync(hookPath, content);

  return hookPath;
}

/**
 * Register a hook in settings.json
 */
export function registerHook(hookPath, trigger, matcher = '') {
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    settings = safeParseJSON(readFileSync(SETTINGS_PATH, 'utf-8'), null, null, {});
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks[trigger]) settings.hooks[trigger] = [];

  // Check if hook already registered
  const existing = settings.hooks[trigger].find(h =>
    h.hooks?.some(hook => hook.command?.includes(hookPath))
  );

  if (!existing) {
    settings.hooks[trigger].push({
      matcher,
      hooks: [{ type: 'command', command: `node ${hookPath}` }],
    });

    atomicWriteJSONSync(SETTINGS_PATH, settings);
    return true;
  }

  return false;
}

// ============================================================================
// REVERSE LOOKUP FUNCTIONS
// These functions support bidirectional ecosystem integration
// ============================================================================

const AGENTS_DIR = join(ROOT, '.claude', 'agents');
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
const WORKFLOWS_DIR = join(ROOT, '.claude', 'workflows');

// Keyword-to-agent mapping for reverse lookups
const HOOK_AGENT_MAPPING = {
  security: ['security-architect', 'devops'],
  auth: ['security-architect', 'developer'],
  credential: ['security-architect'],
  tdd: ['developer', 'qa'],
  test: ['developer', 'qa'],
  lint: ['developer'],
  route: ['router', 'planner'],
  intent: ['router', 'planner'],
  memory: ['planner', 'architect'],
  context: ['planner'],
  audit: ['security-architect', 'devops'],
  log: ['devops', 'devops-troubleshooter'],
  validate: ['developer', 'qa'],
  schema: ['developer', 'architect'],
  deploy: ['devops'],
  infrastructure: ['devops'],
  database: ['developer', 'architect'],
  financial: ['security-architect'],
  payment: ['security-architect', 'developer'],
};

// Keyword-to-skill mapping for reverse lookups
const HOOK_SKILL_MAPPING = {
  test: ['tdd', 'test-generator'],
  tdd: ['tdd'],
  security: ['code-analyzer'],
  audit: ['code-analyzer'],
  validate: ['code-style-validator'],
  lint: ['code-style-validator'],
  debug: ['debugging', 'smart-debug'],
  deploy: ['terraform-infra', 'kubernetes-flux'],
  database: ['text-to-sql'],
};

/**
 * Reverse assessment: Given a hook, find agents and skills that should use it
 *
 * @param {Object} config - Hook configuration
 * @param {string} config.name - Hook name
 * @param {string} config.purpose - Hook purpose description
 * @param {string} config.type - Hook type (PreToolUse, PostToolUse, UserPromptSubmit)
 * @param {string} config.category - Hook category
 * @returns {Object} Agents and skills that should use this hook
 */
export function reverseAssessHook(config) {
  const { name, purpose, type, category } = config;
  const text = `${name} ${purpose} ${category || ''}`.toLowerCase();

  const suggestedAgents = new Set();
  const suggestedSkills = new Set();
  const matchedKeywords = [];

  // Find relevant agents
  for (const [keyword, agents] of Object.entries(HOOK_AGENT_MAPPING)) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      agents.forEach(a => suggestedAgents.add(a));
    }
  }

  // Find relevant skills
  for (const [keyword, skills] of Object.entries(HOOK_SKILL_MAPPING)) {
    if (text.includes(keyword)) {
      skills.forEach(s => suggestedSkills.add(s));
    }
  }

  // Add type-specific suggestions
  if (type === 'UserPromptSubmit') {
    suggestedAgents.add('router');
    suggestedAgents.add('planner');
  }

  // Verify agents exist
  const existingAgents = [];
  for (const agent of suggestedAgents) {
    const agentPaths = [
      join(AGENTS_DIR, 'core', `${agent}.md`),
      join(AGENTS_DIR, 'specialized', `${agent}.md`),
      join(AGENTS_DIR, 'domain', `${agent}.md`),
    ];
    if (agentPaths.some(p => existsSync(p))) {
      existingAgents.push(agent);
    }
  }

  // Verify skills exist
  const existingSkills = [];
  for (const skill of suggestedSkills) {
    if (existsSync(join(SKILLS_DIR, skill, 'SKILL.md'))) {
      existingSkills.push(skill);
    }
  }

  return {
    hook: { name, purpose, type, category },
    matchedKeywords,
    suggestedAgents: existingAgents,
    suggestedSkills: existingSkills,
    assignCommand:
      existingAgents.length > 0
        ? `node .claude/tools/hook-creator/create-hook.mjs --assign "${name}" --agents "${existingAgents.join(',')}"`
        : null,
  };
}

/**
 * Reverse assessment: Given a workflow, find agents that can execute it
 *
 * @param {Object} config - Workflow configuration
 * @param {string} config.name - Workflow name
 * @param {string} config.description - Workflow description
 * @param {Array} config.steps - Workflow steps
 * @returns {Object} Agents and skills related to this workflow
 */
export function reverseAssessWorkflow(config) {
  const { name, description, steps = [] } = config;

  const suggestedAgents = new Set();
  const requiredSkills = new Set();

  // Analyze steps to find agents
  for (const step of steps) {
    const stepId = typeof step === 'string' ? step : step.id;
    const stepAgent = typeof step === 'object' ? step.agent : null;

    if (stepAgent) {
      suggestedAgents.add(stepAgent);
    }

    // Map step types to agents
    const stepAgentMap = {
      analyze: 'developer',
      plan: 'planner',
      implement: 'developer',
      test: 'qa',
      review: 'architect',
      deploy: 'devops',
      document: 'planner',
      security: 'security-architect',
    };

    if (stepAgentMap[stepId]) {
      suggestedAgents.add(stepAgentMap[stepId]);
    }

    // Collect skills from steps
    if (typeof step === 'object' && step.skills) {
      step.skills.forEach(s => requiredSkills.add(s));
    }
  }

  // Verify agents exist
  const existingAgents = [];
  for (const agent of suggestedAgents) {
    const agentPaths = [
      join(AGENTS_DIR, 'core', `${agent}.md`),
      join(AGENTS_DIR, 'specialized', `${agent}.md`),
      join(AGENTS_DIR, 'domain', `${agent}.md`),
    ];
    if (agentPaths.some(p => existsSync(p))) {
      existingAgents.push(agent);
    }
  }

  return {
    workflow: { name, description, stepCount: steps.length },
    suggestedAgents: existingAgents,
    requiredSkills: [...requiredSkills],
    assignCommand:
      existingAgents.length > 0
        ? existingAgents
            .map(
              a =>
                `node .claude/tools/workflow-creator/create-workflow.mjs --assign "${name}" --agent "${a}"`
            )
            .join('\n')
        : null,
  };
}

/**
 * Reverse assessment: Given a schema, find skills and tools that might use it
 *
 * @param {Object} config - Schema configuration
 * @param {string} config.name - Schema name
 * @param {string} config.description - Schema description
 * @returns {Object} Skills and tools that might use this schema
 */
export function reverseAssessSchema(config) {
  const { name, description } = config;
  const text = `${name} ${description || ''}`.toLowerCase();

  const suggestedSkills = new Set();
  const suggestedTools = new Set();

  // Map schema keywords to skills
  const schemaSkillMap = {
    agent: ['agent-creator'],
    skill: ['skill-creator'],
    test: ['test-generator', 'tdd'],
    diagram: ['diagram-generator'],
    doc: ['doc-generator'],
    project: ['project-analyzer'],
  };

  for (const [keyword, skills] of Object.entries(schemaSkillMap)) {
    if (text.includes(keyword)) {
      skills.forEach(s => suggestedSkills.add(s));
    }
  }

  // Map schema keywords to tools
  const schemaToolMap = {
    agent: ['agent-creator'],
    skill: ['skill-creator'],
    hook: ['hook-creator'],
    workflow: ['workflow-creator'],
    project: ['project-analyzer'],
  };

  for (const [keyword, tools] of Object.entries(schemaToolMap)) {
    if (text.includes(keyword)) {
      tools.forEach(t => suggestedTools.add(t));
    }
  }

  return {
    schema: { name, description },
    suggestedSkills: [...suggestedSkills],
    suggestedTools: [...suggestedTools],
  };
}

/**
 * Full bidirectional ecosystem health check
 * Detects orphaned components and missing connections
 */
export function ecosystemHealthCheck(options = {}) {
  return runEcosystemHealthCheck({
    agentsDir: options.agentsDir || AGENTS_DIR,
    skillsDir: options.skillsDir || SKILLS_DIR,
    workflowsDir: options.workflowsDir || WORKFLOWS_DIR,
    settingsPath: options.settingsPath || SETTINGS_PATH,
    rootDir: ROOT,
  });
}

/**
 * Display assessment results in a formatted way
 */
function displayResults(result) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  🔍 ECOSYSTEM ASSESSMENT: ${result.name}`);
  console.log('═'.repeat(60));

  // Summary
  console.log('\n📊 SUMMARY');
  console.log('─'.repeat(40));
  console.log(`  Type: ${result.type}`);
  console.log(`  Critical items: ${result.summary.criticalItems}`);
  console.log(`  High priority: ${result.summary.highPriorityItems}`);
  console.log(`  Total recommendations: ${result.summary.totalRecommendations}`);

  // Hook Recommendations
  if (result.recommendations.hooks.length > 0) {
    console.log('\n⚠️  HOOK RECOMMENDATIONS');
    console.log('─'.repeat(40));
    for (const hook of result.recommendations.hooks) {
      const icon =
        hook.priority === 'critical'
          ? '🔴'
          : hook.priority === 'high'
            ? '🟠'
            : hook.priority === 'medium'
              ? '🟡'
              : '🟢';
      console.log(`  ${icon} [${hook.priority.toUpperCase()}] ${hook.type}`);
      console.log(`     Purpose: ${hook.purpose}`);
      console.log(`     Category: ${hook.category}`);
      console.log(`     Matched: ${hook.matchedKeywords.join(', ')}`);
      if (hook.template) {
        console.log(`     Template: ${hook.template}`);
      }
      console.log('');
    }
  }

  // MCP Server Matches
  if (result.recommendations.mcpServers.length > 0) {
    console.log('\n🔗 MCP SERVER MATCHES');
    console.log('─'.repeat(40));
    for (const match of result.recommendations.mcpServers) {
      const icon = match.existingSkill ? '✅' : '⚠️';
      console.log(`  ${icon} ${match.server} (score: ${match.score})`);
      console.log(`     Matched: ${match.matchedKeywords.join(', ')}`);
      if (match.existingSkill) {
        console.log(`     Skill: ${match.existingSkill.name}`);
      } else if (match.suggestedSkills.length > 0) {
        console.log(`     Create: ${match.suggestedSkills.join(' or ')}`);
      }
      console.log(`     Tools: ${match.toolPrefix}*`);
      console.log('');
    }
  }

  // Skills to Create
  if (result.recommendations.skillsToCreate.length > 0) {
    console.log('\n📦 SKILLS TO CREATE');
    console.log('─'.repeat(40));
    for (const skill of result.recommendations.skillsToCreate) {
      console.log(`  → For MCP: ${skill.forMcp}`);
      console.log(`    Suggested: ${skill.suggestedNames.join(', ')}`);
      console.log(`    Command: ${skill.command}`);
      console.log('');
    }
  }

  // Action Plan
  if (result.actions.length > 0) {
    console.log('\n📋 ACTION PLAN');
    console.log('─'.repeat(40));
    for (let i = 0; i < result.actions.length; i++) {
      const action = result.actions[i];
      const auto = action.auto ? '(auto)' : '(manual)';
      console.log(`  ${i + 1}. [${action.priority.toUpperCase()}] ${action.description} ${auto}`);
      if (action.command) {
        console.log(`     Run: ${action.command}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
}

// CLI usage - normalize paths for Windows compatibility
const scriptPath = process.argv[1] || '';
const isMain =
  import.meta.url === `file://${scriptPath}` ||
  import.meta.url === `file:///${scriptPath.replace(/\\/g, '/')}`;
if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Ecosystem Assessor - Comprehensive integration analysis

Usage:
  node assess-ecosystem.mjs --name "name" --description "description"
  node assess-ecosystem.mjs --type skill --name "name" --description "..."

Options:
  --type          'agent' (default) or 'skill'
  --name          Agent/skill name
  --description   Description text
  --capabilities  Comma-separated capabilities
  --keywords      Comma-separated additional keywords
  --json          Output as JSON
  --create-hooks  Actually create recommended hooks (with confirmation)

Examples:
  node assess-ecosystem.mjs --name "payment-processor" --description "Handles payment transactions"
  node assess-ecosystem.mjs --type skill --name "auth-validator" --description "Validates authentication tokens"
`);
    process.exit(0);
  }

  const options = { type: 'agent' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type') options.type = args[++i];
    if (args[i] === '--name') options.name = args[++i];
    if (args[i] === '--description') options.description = args[++i];
    if (args[i] === '--capabilities') options.capabilities = args[++i]?.split(',');
    if (args[i] === '--keywords') options.keywords = args[++i]?.split(',');
  }

  if (!options.name && !options.description) {
    console.error('Error: --name or --description required');
    process.exit(1);
  }

  const result = assessEcosystem(options);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    displayResults(result);
  }
}

export default assessEcosystem;
