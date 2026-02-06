#!/usr/bin/env node
/**
 * Populate agent-config.json with ALL 49 agents from agent-registry.json
 *
 * Usage: node .claude/tools/cli/populate-agent-config.cjs
 *
 * Process:
 * 1. Read agent-registry.json (49 agents)
 * 2. Read agent-config.json (current: 8 agents)
 * 3. For each registry agent:
 *    - Use existing config if present (preserve manual edits)
 *    - Otherwise, add new entry with:
 *      - tools: from registry requiredTools or fallback
 *      - model: from resolveAgentModel (config.yaml > frontmatter > complexity defaults)
 *      - phase: from existing or null
 * 4. Write updated agent-config.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude/config/agent-config.json');
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');
const BACKUP_PATH = path.join(PROJECT_ROOT, '.claude/config/agent-config.json.backup');

// Import model resolution logic
const { resolveAgentModel } = require('../../lib/utils/agent-config-reader.cjs');

// Fallback tools if registry doesn't have requiredTools
const FALLBACK_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'Skill',
];

function main() {
  console.log('=== Agent Config Population Tool ===\n');

  // Step 1: Read agent-registry.json
  console.log('1. Reading agent-registry.json...');
  const agentRegistry = JSON.parse(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
  const registryAgents = Object.keys(agentRegistry.agents || {});
  console.log(`   Found ${registryAgents.length} agents in registry\n`);

  // Step 2: Read agent-config.json
  console.log('2. Reading agent-config.json...');
  const agentConfig = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf8'));
  const existingAgents = Object.keys(agentConfig.agents || {});
  console.log(`   Found ${existingAgents.length} existing agents in config\n`);

  // Step 3: Create backup
  console.log('3. Creating backup...');
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(agentConfig, null, 2), 'utf8');
  console.log(`   Backup saved to: ${path.relative(PROJECT_ROOT, BACKUP_PATH)}\n`);

  // Step 4: Populate and update agents
  console.log('4. Populating and updating agents...');
  const populationReport = [];
  let addedCount = 0;
  let updatedCount = 0;

  for (const agentId of registryAgents) {
    const registryData = agentRegistry.agents[agentId];
    const isExisting = !!agentConfig.agents[agentId];

    // Resolve model using precedence: config.yaml > frontmatter > complexity defaults
    const resolved = resolveAgentModel(agentId, PROJECT_ROOT);

    // Get tools from registry or use fallback
    const registryTools = registryData.capabilities?.[0]?.requiredTools || [];
    const tools = registryTools.length > 0 ? registryTools : FALLBACK_TOOLS;

    // Determine if update is needed (for existing agents)
    let needsUpdate = false;
    const changes = [];

    if (isExisting) {
      const existing = agentConfig.agents[agentId];

      // Check if model differs
      if (existing.model !== resolved.model) {
        changes.push(`model: ${existing.model} → ${resolved.model} (${resolved.source})`);
        needsUpdate = true;
      }

      // Check if tools differ
      const existingToolsSorted = (existing.tools || []).sort().join(',');
      const newToolsSorted = tools.sort().join(',');
      if (existingToolsSorted !== newToolsSorted) {
        changes.push(`tools: ${existing.tools?.length || 0} → ${tools.length} tools`);
        needsUpdate = true;
      }
    }

    // Create or update agent entry
    agentConfig.agents[agentId] = {
      tools: tools,
      model: resolved.model,
    };

    // Add phase if it's a core agent (optional field)
    if (registryData.category === 'core') {
      const phaseMap = {
        planner: 'planning',
        architect: 'planning',
        developer: 'coding',
        qa: 'qa',
        router: 'routing',
      };
      if (phaseMap[agentId]) {
        agentConfig.agents[agentId].phase = phaseMap[agentId];
      }
    }

    if (isExisting && needsUpdate) {
      updatedCount++;
      populationReport.push({
        agent: agentId,
        action: 'updated',
        changes: changes,
      });
    } else if (!isExisting) {
      addedCount++;
      populationReport.push({
        agent: agentId,
        action: 'added',
        model: resolved.model,
        modelSource: resolved.source,
        toolsSource: registryTools.length > 0 ? 'registry' : 'fallback',
        toolCount: tools.length,
      });
    }
  }

  // Step 5: Write updated config
  console.log('5. Writing updated agent-config.json...');
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(agentConfig, null, 2), 'utf8');
  console.log(`   Population complete!\n`);

  // Step 6: Print report
  console.log('6. Population Report:\n');
  console.log(`   Updated: ${updatedCount} existing agents`);
  console.log(`   Added: ${addedCount} new agents\n`);

  if (populationReport.length > 0) {
    const updated = populationReport.filter(r => r.action === 'updated');
    const added = populationReport.filter(r => r.action === 'added');

    if (updated.length > 0) {
      console.log('   Updated agents:');
      updated.forEach(({ agent, changes }) => {
        console.log(`     ${agent}:`);
        changes.forEach(change => console.log(`       - ${change}`));
      });
      console.log();
    }

    if (added.length > 0) {
      console.log('   Added agents:');
      added.forEach(({ agent, model, modelSource, toolsSource, toolCount }) => {
        console.log(`     ${agent}:`);
        console.log(`       - model: ${model} (from ${modelSource})`);
        console.log(`       - tools: ${toolCount} tools (from ${toolsSource})`);
      });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total agents: ${Object.keys(agentConfig.agents).length}`);
  console.log(`Backup: ${path.relative(PROJECT_ROOT, BACKUP_PATH)}`);
  console.log(`\nValidation: Run "npm test -- tests/lib/agents/populate-agent-config.test.cjs"`);
}

// Error handling
try {
  main();
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
