#!/usr/bin/env node
/**
 * Workflow Registry Generator
 * ===========================
 *
 * Generates .claude/context/artifacts/catalogs/workflow-registry.json from workflow files.
 *
 * Usage:
 *   node .claude/tools/cli/generate-workflow-registry.cjs [options]
 *
 * Options:
 *   --dry-run   Show what would be generated without writing
 *   --validate  Only validate existing registry
 *   --verbose   Show detailed output
 *
 * Output:
 *   .claude/context/artifacts/catalogs/workflow-registry.json
 *
 * Created: 2026-02-05
 * Task: fix-wf-001 (WF-001: workflow-registry.json missing)
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');

// Project root detection
const PROJECT_ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(PROJECT_ROOT, '.claude', 'workflows');
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts');
const REGISTRY_PATH = path.join(ARTIFACTS_DIR, 'workflow-registry.json');

// Workflow category mappings based on directory structure
const CATEGORY_MAP = {
  core: 'core',
  enterprise: 'enterprise',
  operations: 'operations',
  creators: 'creators',
  updaters: 'updaters',
  rapid: 'rapid',
};

// Type detection patterns
const TYPE_PATTERNS = {
  'state-machine': [/state[\s_-]*machine/i, /stateDiagram/i, /State Diagram/i],
  phased: [/phase[\s_]*\d/i, /phases:/i, /## Phase/i],
  parallel: [/parallel/i, /spawn.*parallel/i, /concurrent/i],
  sequential: [/step[\s_]*\d/i, /### Step/i, /sequential/i],
};

// Trigger detection patterns
const TRIGGER_PATTERNS = {
  high_complexity: [/high[\s_-]*complexity/i, /complex/i, /epic/i],
  security_sensitive: [/security/i, /auth/i, /credential/i],
  multi_agent: [/multi[\s_-]*agent/i, /orchestrat/i, /swarm/i],
  evolution: [/evolve/i, /evolution/i, /create.*agent/i, /create.*skill/i],
  incident: [/incident/i, /production/i, /emergency/i],
  reflection: [/reflect/i, /quality/i, /assessment/i],
};

// Agent detection patterns
const AGENT_PATTERNS = {
  planner: [/planner/i, /PLANNER/],
  developer: [/developer/i, /DEVELOPER/],
  architect: [/architect/i, /ARCHITECT/],
  qa: [/\bqa\b/i, /\bQA\b/, /quality/i],
  'security-architect': [/security[\s_-]*architect/i, /SECURITY-ARCHITECT/],
  devops: [/devops/i, /DEVOPS/],
  'technical-writer': [/technical[\s_-]*writer/i, /documentation/i],
  'code-reviewer': [/code[\s_-]*reviewer/i, /review/i],
  router: [/router/i, /ROUTER/],
  'evolution-orchestrator': [/evolution[\s_-]*orchestrator/i],
  'reflection-agent': [/reflection[\s_-]*agent/i],
  'master-orchestrator': [/master[\s_-]*orchestrator/i],
};

/**
 * Recursively scan workflow directory for files with given extension
 * @param {string} extension - File extension to scan for (e.g., '.md', '.yaml')
 * @returns {string[]} - Array of relative paths from workflows directory
 */
function scanWorkflowFiles(extension) {
  const files = [];

  function scanDir(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        // Skip README files
        if (entry.name.toLowerCase() === 'readme.md') continue;
        files.push(relPath);
      }
    }
  }

  scanDir(WORKFLOWS_DIR);
  return files;
}

/**
 * Detect workflow type from content
 * @param {string} content - Workflow file content
 * @returns {string} - Detected type
 */
function detectWorkflowType(content) {
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return type;
      }
    }
  }
  return 'sequential'; // Default
}

/**
 * Count phases in workflow content
 * @param {string} content - Workflow file content
 * @returns {number} - Number of phases detected
 */
function countPhases(content) {
  // Check for numbered phases
  const phaseMatches = content.match(/##\s*Phase\s*\d+/gi) || [];
  if (phaseMatches.length > 0) return phaseMatches.length;

  // Check for step numbering
  const stepMatches = content.match(/###\s*Step\s*\d+/gi) || [];
  if (stepMatches.length > 0) return stepMatches.length;

  // Check YAML phases
  const yamlPhases = content.match(/^\s*phases:/im);
  if (yamlPhases) {
    const phaseCount = (content.match(/^\s{2,4}[a-z]+:/gm) || []).length;
    return Math.max(phaseCount, 1);
  }

  return 1;
}

/**
 * Detect triggers from content
 * @param {string} content - Workflow file content
 * @returns {string[]} - Array of detected triggers
 */
function detectTriggers(content) {
  const triggers = [];
  for (const [trigger, patterns] of Object.entries(TRIGGER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        triggers.push(trigger);
        break; // Only add each trigger once
      }
    }
  }
  return triggers;
}

/**
 * Detect required agents from content
 * @param {string} content - Workflow file content
 * @returns {string[]} - Array of detected agent names
 */
function detectRequiredAgents(content) {
  const agents = [];
  for (const [agent, patterns] of Object.entries(AGENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        agents.push(agent);
        break; // Only add each agent once
      }
    }
  }
  return agents;
}

/**
 * Extract description from workflow content
 * @param {string} content - Workflow file content
 * @param {string} format - File format ('md' or 'yaml')
 * @returns {string} - Extracted description
 */
function extractDescription(content, format) {
  if (format === 'yaml') {
    // Look for description field in YAML
    const match = content.match(/^description:\s*(.+)$/m);
    if (match) return match[1].trim();
  } else {
    // Look for first paragraph after H1
    const lines = content.split('\n');
    let foundH1 = false;
    let description = '';
    for (const line of lines) {
      if (line.startsWith('# ')) {
        foundH1 = true;
        continue;
      }
      if (foundH1 && line.trim() && !line.startsWith('#') && !line.startsWith('```')) {
        // Skip Extended Thinking sections
        if (line.includes('**Extended Thinking**')) continue;
        // Skip frontmatter
        if (line === '---') continue;
        description = line.trim();
        // Remove markdown bold/italic
        description = description.replace(/\*\*/g, '').replace(/\*/g, '');
        // Truncate if too long
        if (description.length > 200) {
          description = description.substring(0, 197) + '...';
        }
        break;
      }
    }
    return description;
  }
  return '';
}

/**
 * Extract workflow name from content
 * @param {string} content - Workflow file content
 * @param {string} filename - File name without path
 * @param {string} format - File format
 * @returns {string} - Workflow name
 */
function extractWorkflowName(content, filename, format) {
  if (format === 'yaml') {
    const match = content.match(/^name:\s*(.+)$/m);
    if (match) return match[1].trim();
  } else {
    // Look for H1
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      // Convert H1 to kebab-case name
      return match[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
  }
  // Fallback to filename without extension
  return filename.replace(/\.(md|yaml)$/, '');
}

/**
 * Extract metadata from a workflow file
 * @param {string} relativePath - Relative path from workflows directory
 * @param {string} format - File format ('md' or 'yaml')
 * @returns {Object} - Extracted metadata
 */
function extractWorkflowMetadata(relativePath, format) {
  const fullPath = path.join(WORKFLOWS_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const filename = path.basename(relativePath);
  const dirName = path.dirname(relativePath);

  // Determine category from directory structure
  let category = 'root';
  if (dirName && dirName !== '.') {
    const topDir = dirName.split('/')[0].split('\\')[0];
    category = CATEGORY_MAP[topDir] || topDir;
  }

  // Extract or detect metadata
  const name = extractWorkflowName(content, filename, format);
  const type = detectWorkflowType(content);
  const description = extractDescription(content, format);
  const phases = countPhases(content);
  const triggers = detectTriggers(content);
  const requiredAgents = detectRequiredAgents(content);

  // Check for status indicators
  let status = 'active';
  if (/deprecated/i.test(content)) status = 'deprecated';
  else if (/dormant/i.test(content)) status = 'dormant';
  else if (/draft/i.test(content)) status = 'draft';

  return {
    path: relativePath,
    category,
    type,
    description,
    phases,
    requiredAgents,
    triggers,
    status,
    name,
  };
}

/**
 * Generate the complete workflow registry
 * @returns {Object} - Complete registry object
 */
function generateRegistry() {
  const mdFiles = scanWorkflowFiles('.md');
  const yamlFiles = scanWorkflowFiles('.yaml');

  const workflows = {};

  // Process markdown workflows
  for (const filePath of mdFiles) {
    const metadata = extractWorkflowMetadata(filePath, 'md');
    if (metadata) {
      const key = metadata.name || filePath.replace(/\.md$/, '').replace(/\//g, '-');
      workflows[key] = {
        path: metadata.path,
        category: metadata.category,
        type: metadata.type,
        description: metadata.description,
        phases: metadata.phases,
        requiredAgents: metadata.requiredAgents,
        triggers: metadata.triggers,
        status: metadata.status,
      };
    }
  }

  // Process YAML workflows
  for (const filePath of yamlFiles) {
    const metadata = extractWorkflowMetadata(filePath, 'yaml');
    if (metadata) {
      const key = metadata.name || filePath.replace(/\.yaml$/, '').replace(/\//g, '-');
      workflows[key] = {
        path: metadata.path,
        category: metadata.category,
        type: metadata.type,
        description: metadata.description,
        phases: metadata.phases,
        requiredAgents: metadata.requiredAgents,
        triggers: metadata.triggers,
        status: metadata.status,
      };
    }
  }

  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    summary: {
      total: Object.keys(workflows).length,
      byCategory: countByCategory(workflows),
      byType: countByType(workflows),
      byStatus: countByStatus(workflows),
    },
    workflows,
  };
}

/**
 * Count workflows by category
 * @param {Object} workflows - Workflows object
 * @returns {Object} - Counts by category
 */
function countByCategory(workflows) {
  const counts = {};
  for (const workflow of Object.values(workflows)) {
    counts[workflow.category] = (counts[workflow.category] || 0) + 1;
  }
  return counts;
}

/**
 * Count workflows by type
 * @param {Object} workflows - Workflows object
 * @returns {Object} - Counts by type
 */
function countByType(workflows) {
  const counts = {};
  for (const workflow of Object.values(workflows)) {
    counts[workflow.type] = (counts[workflow.type] || 0) + 1;
  }
  return counts;
}

/**
 * Count workflows by status
 * @param {Object} workflows - Workflows object
 * @returns {Object} - Counts by status
 */
function countByStatus(workflows) {
  const counts = {};
  for (const workflow of Object.values(workflows)) {
    counts[workflow.status] = (counts[workflow.status] || 0) + 1;
  }
  return counts;
}

/**
 * Validate a registry object
 * @param {Object} registry - Registry to validate
 * @returns {string[]} - Array of error messages (empty if valid)
 */
function validateRegistry(registry) {
  const errors = [];

  if (!registry.version) {
    errors.push('Missing version');
  }

  if (!registry.lastUpdated) {
    errors.push('Missing lastUpdated');
  }

  if (!registry.workflows) {
    errors.push('Missing workflows object');
    return errors;
  }

  // Validate each workflow
  for (const [name, workflow] of Object.entries(registry.workflows)) {
    if (!workflow.path) {
      errors.push(`Workflow "${name}" missing path`);
      continue;
    }

    // Check if file exists
    const fullPath = path.join(WORKFLOWS_DIR, workflow.path);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Workflow "${name}" file not found: ${workflow.path}`);
    }

    // Validate required fields
    if (!workflow.category) {
      errors.push(`Workflow "${name}" missing category`);
    }
    if (!workflow.type) {
      errors.push(`Workflow "${name}" missing type`);
    }
    if (!workflow.status) {
      errors.push(`Workflow "${name}" missing status`);
    }
  }

  return errors;
}

/**
 * Write registry to file
 * @param {Object} registry - Registry object to write
 * @param {boolean} dryRun - If true, don't actually write
 * @returns {boolean} - True if successful
 */
function writeRegistry(registry, dryRun = false) {
  // Ensure artifacts directory exists
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    if (!dryRun) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
  }

  const content = JSON.stringify(registry, null, 2);

  if (dryRun) {
    console.log('Would write to:', REGISTRY_PATH);
    console.log('Content preview (first 500 chars):', content.substring(0, 500));
    return true;
  }

  fs.writeFileSync(REGISTRY_PATH, content, 'utf8');
  return true;
}

/**
 * Main CLI function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate');
  const verbose = args.includes('--verbose');

  console.log('Workflow Registry Generator');
  console.log('===========================');
  console.log('');

  if (validateOnly) {
    // Load and validate existing registry
    if (!fs.existsSync(REGISTRY_PATH)) {
      console.error('ERROR: Registry file not found:', REGISTRY_PATH);
      process.exit(1);
    }

    const registry = safeParseJSON(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const errors = validateRegistry(registry);

    if (errors.length > 0) {
      console.error('Validation errors:');
      errors.forEach(e => console.error('  -', e));
      process.exit(1);
    }

    const totalWorkflows = registry.workflows ? Object.keys(registry.workflows).length : 0;
    console.log('Registry is valid.');
    console.log('Total workflows:', totalWorkflows);
    process.exit(0);
  }

  // Scan for workflows
  const mdFiles = scanWorkflowFiles('.md');
  const yamlFiles = scanWorkflowFiles('.yaml');

  console.log(`Found ${mdFiles.length} .md workflow files`);
  console.log(`Found ${yamlFiles.length} .yaml workflow files`);
  console.log('');

  if (verbose) {
    console.log('Markdown workflows:');
    mdFiles.forEach(f => console.log('  -', f));
    console.log('');
    console.log('YAML workflows:');
    yamlFiles.forEach(f => console.log('  -', f));
    console.log('');
  }

  // Generate registry
  const registry = generateRegistry();
  const errors = validateRegistry(registry);

  if (errors.length > 0) {
    console.error('Validation errors in generated registry:');
    errors.forEach(e => console.error('  -', e));
    process.exit(1);
  }

  const generatedWorkflowCount = registry.workflows ? Object.keys(registry.workflows).length : 0;
  console.log('Generated registry with', generatedWorkflowCount, 'workflows');
  console.log('');
  console.log('Summary:');
  console.log('  By category:', JSON.stringify(registry.summary.byCategory));
  console.log('  By type:', JSON.stringify(registry.summary.byType));
  console.log('  By status:', JSON.stringify(registry.summary.byStatus));
  console.log('');

  // Write registry
  if (writeRegistry(registry, dryRun)) {
    if (dryRun) {
      console.log('Dry run complete. No files written.');
    } else {
      console.log('Registry written to:', REGISTRY_PATH);
    }
  }

  // Show core workflows verification
  const coreWorkflows = Object.keys(registry.workflows).filter(n => {
    const w = registry.workflows[n];
    return w.category === 'core';
  });
  console.log('');
  console.log('Core workflows:', coreWorkflows.join(', '));
}

// Export for testing
module.exports = {
  scanWorkflowFiles,
  extractWorkflowMetadata,
  generateRegistry,
  validateRegistry,
  writeRegistry,
  PROJECT_ROOT,
  WORKFLOWS_DIR,
  REGISTRY_PATH,
};

// Run CLI if called directly
const wrappedMain = wrapCLITool(main, 'generate-workflow-registry');

if (require.main === module) {
  wrappedMain();
}
