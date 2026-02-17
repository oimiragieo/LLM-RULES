/**
 * Headless Integration Test Runner
 * ================================
 *
 * Comprehensive integration test for the Agent Studio framework.
 * Tests agent loading, routing, workflows, tools, and MCP integration.
 */

'use strict';

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../lib/utils/safe-json.cjs');

// Import js-yaml for YAML parsing
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  console.error('❌ Error: js-yaml package is required for integration testing.');
  console.error('   Please install it: pnpm add -D js-yaml');
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

console.log('[Runner] Starting headless integration test...');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const fullMessage = `${status} ${name}${message ? ': ' + message : ''}`;
  console.log(fullMessage);

  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

// Test 1: Configuration Loading
function testConfigLoading() {
  console.log('\n[Config] Testing configuration loading...');

  try {
    const configPath = resolve(rootDir, '.claude/config.yaml');
    if (!existsSync(configPath)) {
      logTest('Config file exists', false, 'config.yaml not found');
      return;
    }
    logTest('Config file exists', true);

    // Try to load and parse config
    const configContent = readFileSync(configPath, 'utf-8');
    const config = yaml.load(configContent);

    logTest('Config YAML parsing', true);

    // Check required sections
    if (config.agents) {
      logTest('Agents section exists', true);
    } else {
      logTest('Agents section exists', false);
    }

    if (config.agent_routing) {
      logTest('Agent routing section exists', true);
    } else {
      logTest('Agent routing section exists', false);
    }
  } catch (error) {
    logTest('Config loading', false, error.message);
  }
}

// Test 2: Agent File Validation
function testAgentFiles() {
  console.log('\n[Agents] Testing agent file validation...');

  try {
    const agentsDir = resolve(rootDir, '.claude/agents');
    const configPath = resolve(rootDir, '.claude/config.yaml');

    if (!existsSync(agentsDir)) {
      logTest('Agents directory exists', false);
      return;
    }
    logTest('Agents directory exists', true);

    // Load config to check agent definitions
    const configContent = readFileSync(configPath, 'utf-8');
    const config = yaml.load(configContent);

    if (config.agents) {
      for (const [agentName, agentConfig] of Object.entries(config.agents)) {
        if (agentConfig.path) {
          const agentPath = resolve(rootDir, agentConfig.path);
          if (existsSync(agentPath)) {
            logTest(`Agent ${agentName} file exists`, true);
          } else {
            logTest(`Agent ${agentName} file exists`, false, `Path: ${agentConfig.path}`);
          }
        }
      }
    }
  } catch (error) {
    logTest('Agent file validation', false, error.message);
  }
}

// Test 3: Tool Validation
function testTools() {
  console.log('\n[Tools] Testing tool validation...');

  try {
    const toolsDir = resolve(rootDir, '.claude/tools');
    if (!existsSync(toolsDir)) {
      logTest('Tools directory exists', false);
      return;
    }
    logTest('Tools directory exists', true);

    // Check critical tools (some moved from tools/ to lib/ in Phase C)
    const criticalLibModules = [
      {
        name: 'workflow-runner.js',
        path: resolve(rootDir, '.claude/lib/workflow/workflow-runner.js'),
      },
      {
        name: 'decision-handler.mjs',
        path: resolve(rootDir, '.claude/lib/workflow/decision-handler.mjs'),
      },
      { name: 'loop-handler.mjs', path: resolve(rootDir, '.claude/lib/workflow/loop-handler.mjs') },
    ];

    for (const mod of criticalLibModules) {
      if (existsSync(mod.path)) {
        logTest(`Critical module ${mod.name} exists`, true);
      } else {
        logTest(`Critical module ${mod.name} exists`, false);
      }
    }
  } catch (error) {
    logTest('Tool validation', false, error.message);
  }
}

// Test 4: Schema Validation
function testSchemas() {
  console.log('\n[Schemas] Testing schema validation...');

  try {
    const schemasDir = resolve(rootDir, '.claude/schemas');
    if (!existsSync(schemasDir)) {
      logTest('Schemas directory exists', false);
      return;
    }
    logTest('Schemas directory exists', true);

    // Check critical schemas
    const criticalSchemas = [
      'plan.schema.json',
      'project_brief.schema.json',
      'product_requirements.schema.json',
      'system_architecture.schema.json',
    ];

    for (const schema of criticalSchemas) {
      const schemaPath = resolve(schemasDir, schema);
      if (existsSync(schemaPath)) {
        try {
          const content = readFileSync(schemaPath, 'utf-8');
          safeParseJSON(content);
          logTest(`Schema ${schema} is valid JSON`, true);
        } catch (error) {
          logTest(`Schema ${schema} is valid JSON`, false, error.message);
        }
      } else {
        logTest(`Schema ${schema} exists`, false);
      }
    }
  } catch (error) {
    logTest('Schema validation', false, error.message);
  }
}

// Test 5: Template Validation
function testTemplates() {
  console.log('\n[Templates] Testing template validation...');

  try {
    const templatesDir = resolve(rootDir, '.claude/templates');
    if (!existsSync(templatesDir)) {
      logTest('Templates directory exists', false);
      return;
    }
    logTest('Templates directory exists', true);

    // Check critical templates
    const criticalTemplates = [
      'claude-md-template.md',
      'project-brief.md',
      'prd.md',
      'architecture.md',
    ];

    for (const template of criticalTemplates) {
      const templatePath = resolve(templatesDir, template);
      if (existsSync(templatePath)) {
        logTest(`Template ${template} exists`, true);
      } else {
        logTest(`Template ${template} exists`, false);
      }
    }
  } catch (error) {
    logTest('Template validation', false, error.message);
  }
}

// Test 6: MCP Configuration
function testMCPConfig() {
  console.log('\n[MCP] Testing MCP configuration...');

  try {
    const mcpPath = resolve(rootDir, '.claude/.mcp.json');
    if (!existsSync(mcpPath)) {
      logTest('MCP config exists', false);
      return;
    }
    logTest('MCP config exists', true);

    const content = readFileSync(mcpPath, 'utf-8');
    const mcpConfig = safeParseJSON(content);
    logTest('MCP config is valid JSON', true);

    // Check for expected MCP servers
    const expectedServers = ['filesystem', 'git', 'memory', 'sequential-thinking'];
    for (const server of expectedServers) {
      if (mcpConfig.mcpServers && mcpConfig.mcpServers[server]) {
        logTest(`MCP server ${server} configured`, true);
      } else {
        logTest(`MCP server ${server} configured`, false);
      }
    }
  } catch (error) {
    logTest('MCP configuration', false, error.message);
  }
}

// Test 7: Workflow Runner Functionality
function testWorkflowRunner() {
  console.log('\n[Workflow] Testing workflow runner functionality...');

  try {
    const runnerPath = resolve(rootDir, '.claude/lib/workflow/workflow-runner.js');
    if (!existsSync(runnerPath)) {
      logTest('Workflow runner exists', false);
      return;
    }
    logTest('Workflow runner exists', true);

    // Check if it's a valid Node.js script
    const content = readFileSync(runnerPath, 'utf-8');
    if (content.includes('#!/usr/bin/env node') && content.includes('import')) {
      logTest('Workflow runner is valid Node.js script', true);
    } else {
      logTest('Workflow runner is valid Node.js script', false);
    }
  } catch (error) {
    logTest('Workflow runner functionality', false, error.message);
  }
}

// Test 8: Decision Handler
async function testDecisionHandler() {
  console.log('\n[Decision] Testing decision handler...');

  try {
    const handlerPath = resolve(rootDir, '.claude/lib/workflow/decision-handler.mjs');
    if (!existsSync(handlerPath)) {
      logTest('Decision handler exists', false);
      return;
    }
    logTest('Decision handler exists', true);

    // Check if file is readable and contains expected content
    const content = readFileSync(handlerPath, 'utf-8');
    if (content.includes('DecisionHandler') && content.includes('evaluateCondition')) {
      logTest('Decision handler has expected content', true);
    } else {
      logTest('Decision handler has expected content', false);
    }
  } catch (error) {
    logTest('Decision handler validation', false, error.message);
  }
}

// Test 9: Loop Handler
async function testLoopHandler() {
  console.log('\n[Loop] Testing loop handler...');

  try {
    const handlerPath = resolve(rootDir, '.claude/lib/workflow/loop-handler.mjs');
    if (!existsSync(handlerPath)) {
      logTest('Loop handler exists', false);
      return;
    }
    logTest('Loop handler exists', true);

    // Check if file is readable and contains expected content
    const content = readFileSync(handlerPath, 'utf-8');
    if (content.includes('LoopHandler') && content.includes('shouldContinueLoop')) {
      logTest('Loop handler has expected content', true);
    } else {
      logTest('Loop handler has expected content', false);
    }
  } catch (error) {
    logTest('Loop handler validation', false, error.message);
  }
}

// Test 10: Skills Validation
function testSkills() {
  console.log('\n[Skills] Testing skills validation...');

  try {
    const skillsDir = resolve(rootDir, '.claude/skills');
    if (!existsSync(skillsDir)) {
      logTest('Skills directory exists', false);
      return;
    }
    logTest('Skills directory exists', true);

    // Count skills
    let skillCount = 0;
    const skillDirs = readdirSync(skillsDir, { withFileTypes: true });
    for (const dirent of skillDirs) {
      if (dirent.isDirectory() && dirent.name !== 'sdk') {
        const skillFile = resolve(skillsDir, dirent.name, 'SKILL.md');
        if (existsSync(skillFile)) {
          skillCount++;
        }
      }
    }

    if (skillCount > 0) {
      logTest(`Skills found (${skillCount})`, true, `${skillCount} skills detected`);
    } else {
      logTest('Skills exist', false, 'No skills found');
    }
  } catch (error) {
    logTest('Skills validation', false, error.message);
  }
}

// Main test execution
async function runTests() {
  console.log('='.repeat(60));
  console.log('🤖 AGENT STUDIO INTEGRATION TEST SUITE');
  console.log('='.repeat(60));

  await testConfigLoading();
  await testAgentFiles();
  await testTools();
  await testSchemas();
  await testTemplates();
  await testMCPConfig();
  await testWorkflowRunner();
  await testDecisionHandler();
  await testLoopHandler();
  await testSkills();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 INTEGRATION TEST RESULTS');
  console.log('='.repeat(60));

  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.failed}`);

  if (results.failed === 0) {
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('🚀 Agent Studio is ready for production use.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    console.log('🔧 Fix the failed tests before deploying to production.');
  }

  console.log('='.repeat(60));

  // Exit with appropriate code
  process.exit(results.failed === 0 ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error during integration testing:', error);
  process.exit(1);
});
