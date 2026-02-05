#!/usr/bin/env node
/**
 * Migrate agent-config.json: Remove deprecated thinkingDefault, add explicit model field
 *
 * Usage: node .claude/tools/cli/migrate-agent-config.cjs
 *
 * Migration Rules:
 * 1. Remove thinkingDefault field
 * 2. Add model field matching config.yaml (if available)
 * 3. For agents not in config.yaml:
 *    - thinkingDefault="high" → claude-opus-4-5-20251101
 *    - thinkingDefault="medium" → claude-sonnet-4-5
 *    - thinkingDefault="none" → claude-sonnet-4-5
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude/config/agent-config.json');
const CONFIG_YAML_PATH = path.join(PROJECT_ROOT, '.claude/config.yaml');
const BACKUP_PATH = path.join(PROJECT_ROOT, '.claude/config/agent-config.json.backup');

// Model mapping from thinkingDefault to model
const THINKING_DEFAULT_MODEL_MAP = {
  high: 'claude-opus-4-5-20251101',
  medium: 'claude-sonnet-4-5',
  low: 'claude-haiku-4-5',
  none: 'claude-sonnet-4-5',
  ultrathink: 'claude-opus-4-5-20251101',
};

function main() {
  console.log('=== Agent Config Migration Tool ===\n');

  // Step 1: Read config.yaml for canonical models
  console.log('1. Reading config.yaml...');
  const configYaml = yaml.load(fs.readFileSync(CONFIG_YAML_PATH, 'utf8'));
  const yamlModels = {};
  if (configYaml.agents) {
    for (const [agentType, config] of Object.entries(configYaml.agents)) {
      if (config.model) {
        yamlModels[agentType] = config.model;
      }
    }
  }
  console.log(`   Found ${Object.keys(yamlModels).length} agent models in config.yaml`);
  console.log(`   Models: ${JSON.stringify(yamlModels, null, 2)}\n`);

  // Step 2: Read agent-config.json
  console.log('2. Reading agent-config.json...');
  const agentConfig = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf8'));
  console.log(`   Found ${Object.keys(agentConfig.agents).length} agents\n`);

  // Step 3: Create backup
  console.log('3. Creating backup...');
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(agentConfig, null, 2), 'utf8');
  console.log(`   Backup saved to: ${path.relative(PROJECT_ROOT, BACKUP_PATH)}\n`);

  // Step 4: Migrate each agent
  console.log('4. Migrating agents...');
  let migrationCount = 0;
  const migrationReport = [];

  for (const [agentType, agentData] of Object.entries(agentConfig.agents)) {
    const changes = [];

    // Check for thinkingDefault field
    if (agentData.thinkingDefault !== undefined) {
      const oldThinkingDefault = agentData.thinkingDefault;

      // Determine model
      let model;
      if (yamlModels[agentType]) {
        // Use model from config.yaml (canonical)
        model = yamlModels[agentType];
        changes.push(`model: ${model} (from config.yaml)`);
      } else {
        // Map thinkingDefault to model
        model = THINKING_DEFAULT_MODEL_MAP[oldThinkingDefault] || 'claude-sonnet-4-5';
        changes.push(`model: ${model} (mapped from thinkingDefault=${oldThinkingDefault})`);
      }

      // Add model field
      agentData.model = model;

      // Remove thinkingDefault field
      delete agentData.thinkingDefault;
      changes.push(`removed thinkingDefault: "${oldThinkingDefault}"`);

      migrationCount++;
      migrationReport.push({
        agent: agentType,
        changes,
      });
    } else if (yamlModels[agentType]) {
      // Agent doesn't have thinkingDefault, but config.yaml has a model
      agentData.model = yamlModels[agentType];
      changes.push(`model: ${yamlModels[agentType]} (from config.yaml, no thinkingDefault)`);

      migrationCount++;
      migrationReport.push({
        agent: agentType,
        changes,
      });
    }
  }

  // Step 5: Write migrated config
  console.log('5. Writing migrated agent-config.json...');
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(agentConfig, null, 2), 'utf8');
  console.log(`   Migration complete!\n`);

  // Step 6: Print report
  console.log('6. Migration Report:\n');
  migrationReport.forEach(({ agent, changes }) => {
    console.log(`   ${agent}:`);
    changes.forEach(change => console.log(`     - ${change}`));
  });

  console.log(`\n=== Summary ===`);
  console.log(`Migrated: ${migrationCount} agents`);
  console.log(`Backup: ${path.relative(PROJECT_ROOT, BACKUP_PATH)}`);
  console.log(`\nValidation: Run "node -e \\"JSON.parse(require('fs').readFileSync('.claude/config/agent-config.json', 'utf8'))\\""`)
}

// Error handling
try {
  main();
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}
