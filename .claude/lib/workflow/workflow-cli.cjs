#!/usr/bin/env node
/**
 * Workflow CLI
 * ============
 *
 * Command-line interface for executing EVOLVE workflows.
 * Part of the executable workflow ecosystem.
 *
 * Usage:
 *   # Execute a creator workflow
 *   node .claude/lib/workflow-cli.cjs create agent --name "my-agent" --type domain
 *
 *   # Execute an updater workflow
 *   node .claude/lib/workflow-cli.cjs update skill --name "tdd" --changes "add new pattern"
 *
 *   # Resume a paused workflow
 *   node .claude/lib/workflow-cli.cjs resume <checkpoint-id>
 *
 *   # List active/paused workflows
 *   node .claude/lib/workflow-cli.cjs list
 *
 *   # Show workflow status
 *   node .claude/lib/workflow-cli.cjs status <workflow-id>
 *
 *   # Rollback a failed workflow
 *   node .claude/lib/workflow-cli.cjs rollback <workflow-id>
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// Constants
// =============================================================================

/**
 * Available commands
 */
const COMMANDS = {
  CREATE: 'create',
  UPDATE: 'update',
  RESUME: 'resume',
  LIST: 'list',
  STATUS: 'status',
  ROLLBACK: 'rollback',
  HELP: 'help',
};

/**
 * Workflow types that can be created or updated
 */
const WORKFLOW_TYPES = ['agent', 'skill', 'hook', 'workflow', 'template', 'schema'];

/**
 * Default paths
 */
const DEFAULT_PATHS = {
  workflowsDir: '.claude/workflows',
  creatorsDir: '.claude/workflows/creators',
  updatersDir: '.claude/workflows/updaters',
  checkpointDir: '.claude/context/checkpoints',
};

// =============================================================================
// Argument Parser
// =============================================================================

/**
 * Parse command-line arguments
 *
 * @param {string[]} args - Command-line arguments (without node and script path)
 * @returns {Object} Parsed arguments
 */
function parseArgs(args) {
  const result = {
    command: null,
    workflowType: null,
    checkpointId: null,
    workflowId: null,
    options: {},
    showHelp: false,
    error: null,
  };

  if (args.length === 0) {
    result.showHelp = true;
    return result;
  }

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    result.showHelp = true;
    return result;
  }

  // Get command
  const command = args[0].toLowerCase();

  // Validate command
  if (!Object.values(COMMANDS).includes(command)) {
    result.error = `Unknown command: ${command}. Use --help for available commands.`;
    return result;
  }

  result.command = command;

  // Parse command-specific arguments
  switch (command) {
    case COMMANDS.CREATE:
    case COMMANDS.UPDATE:
      if (args.length < 2) {
        result.error = `${command} command requires a workflow type (agent, skill, hook, etc.)`;
        return result;
      }
      result.workflowType = args[1].toLowerCase();
      break;

    case COMMANDS.RESUME:
      if (args.length < 2) {
        result.error = 'resume command requires a checkpoint ID';
        return result;
      }
      result.checkpointId = args[1];
      break;

    case COMMANDS.STATUS:
    case COMMANDS.ROLLBACK:
      if (args.length < 2) {
        result.error = `${command} command requires a workflow ID`;
        return result;
      }
      result.workflowId = args[1];
      break;

    case COMMANDS.LIST:
      // No additional arguments required
      break;
  }

  // Parse options (--key value pairs and boolean flags)
  for (let i = command === COMMANDS.LIST ? 1 : 2; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.substring(2);

      // Boolean flags
      if (key === 'dry-run' || key === 'dryRun') {
        result.options.dryRun = true;
        continue;
      }
      if (key === 'verbose' || key === 'v') {
        result.options.verbose = true;
        continue;
      }

      // Key-value pairs
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result.options[toCamelCase(key)] = nextArg;
        i++; // Skip the value
      } else {
        result.options[toCamelCase(key)] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.substring(1);
      if (key === 'n') result.options.name = args[++i];
      else if (key === 't') result.options.type = args[++i];
      else if (key === 'c') result.options.changes = args[++i];
      else if (key === 'v') result.options.verbose = true;
    }
  }

  return result;
}

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

// =============================================================================
// WorkflowCLI Class
// =============================================================================

/**
 * Command-line interface for workflow execution
 */
class WorkflowCLI {
  /**
   * Create a new WorkflowCLI instance
   *
   * @param {Object} options - Configuration options
   * @param {string} options.workflowsDir - Directory containing workflows
   * @param {string} options.checkpointDir - Directory for checkpoints
   * @param {boolean} options.testMode - Enable test mode
   */
  constructor(options = {}) {
    const basePath = options.basePath || process.cwd();

    this.options = {
      basePath,
      workflowsDir: options.workflowsDir || path.join(basePath, DEFAULT_PATHS.workflowsDir),
      creatorsDir: options.creatorsDir || path.join(basePath, DEFAULT_PATHS.creatorsDir),
      updatersDir: options.updatersDir || path.join(basePath, DEFAULT_PATHS.updatersDir),
      checkpointDir: options.checkpointDir || path.join(basePath, DEFAULT_PATHS.checkpointDir),
      testMode: options.testMode || false,
    };

    this.verbose = false;
    this._activeWorkflows = new Map();
  }

  /**
   * Enable/disable verbose output
   *
   * @param {boolean} enabled
   */
  setVerbose(enabled) {
    this.verbose = enabled;
  }

  /**
   * Log message (respects verbose setting)
   *
   * @param {string} message - Message to log
   * @param {string} level - Log level: 'info', 'verbose', 'error'
   */
  log(message, level = 'info') {
    if (level === 'verbose' && !this.verbose) {
      return;
    }
    if (level === 'error') {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  /**
   * Get workflow path for a command and type
   *
   * @param {string} command - 'create' or 'update'
   * @param {string} workflowType - Type: agent, skill, hook, etc.
   * @returns {string} Full path to workflow YAML
   */
  getWorkflowPath(command, workflowType) {
    const dir = command === COMMANDS.CREATE ? this.options.creatorsDir : this.options.updatersDir;
    const suffix = command === COMMANDS.CREATE ? 'creator' : 'updater';
    const fileName = `${workflowType}-${suffix}-workflow.yaml`;
    const fullPath = path.join(dir, fileName);

    // Check if workflow exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Workflow not found: ${fileName}`);
    }

    return fullPath;
  }

  /**
   * List all available workflows
   *
   * @returns {Promise<Array<{name: string, path: string, type: string}>>}
   */
  async listWorkflows() {
    const workflows = [];

    // List creator workflows
    if (fs.existsSync(this.options.creatorsDir)) {
      const creatorFiles = fs.readdirSync(this.options.creatorsDir);
      for (const file of creatorFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = file.replace(/-workflow\.(yaml|yml)$/, '').replace(/-creator$/, '');
          workflows.push({
            name: name.replace('-creator', ''),
            path: path.join(this.options.creatorsDir, file),
            type: 'creator',
          });
        }
      }
    }

    // List updater workflows
    if (fs.existsSync(this.options.updatersDir)) {
      const updaterFiles = fs.readdirSync(this.options.updatersDir);
      for (const file of updaterFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = file.replace(/-workflow\.(yaml|yml)$/, '').replace(/-updater$/, '');
          workflows.push({
            name: name.replace('-updater', ''),
            path: path.join(this.options.updatersDir, file),
            type: 'updater',
          });
        }
      }
    }

    return workflows;
  }

  /**
   * Run the CLI with parsed arguments
   *
   * @param {Object} args - Parsed arguments from parseArgs
   * @returns {Promise<Object>} Result of execution
   */
  async run(args) {
    // Set verbose mode
    if (args.options && args.options.verbose) {
      this.setVerbose(true);
    }

    // Handle help
    if (args.showHelp) {
      return { help: this.getHelp() };
    }

    // Handle errors
    if (args.error) {
      return { error: args.error };
    }

    // Handle dry-run mode
    if (args.options && args.options.dryRun) {
      return this._handleDryRun(args);
    }

    // Execute command
    switch (args.command) {
      case COMMANDS.CREATE:
        return this._executeCreate(args);

      case COMMANDS.UPDATE:
        return this._executeUpdate(args);

      case COMMANDS.RESUME:
        return this._executeResume(args);

      case COMMANDS.LIST:
        return this._executeList(args);

      case COMMANDS.STATUS:
        return this._executeStatus(args);

      case COMMANDS.ROLLBACK:
        return this._executeRollback(args);

      default:
        return { error: `Unknown command: ${args.command}` };
    }
  }

  /**
   * Handle dry-run mode
   * @private
   */
  _handleDryRun(args) {
    const result = {
      dryRun: true,
      command: args.command,
      wouldExecute: null,
    };

    try {
      if (args.command === COMMANDS.CREATE || args.command === COMMANDS.UPDATE) {
        const workflowPath = this.getWorkflowPath(args.command, args.workflowType);
        result.wouldExecute = {
          workflow: workflowPath,
          type: args.workflowType,
          options: args.options,
        };
      } else if (args.command === COMMANDS.RESUME) {
        result.wouldExecute = {
          checkpoint: args.checkpointId,
        };
      } else if (args.command === COMMANDS.LIST) {
        result.wouldExecute = {
          action: 'list all workflows',
        };
      } else if (args.command === COMMANDS.STATUS || args.command === COMMANDS.ROLLBACK) {
        result.wouldExecute = {
          workflowId: args.workflowId,
          action: args.command,
        };
      }
    } catch (e) {
      result.error = e.message;
    }

    return result;
  }

  /**
   * Execute create command
   * @private
   */
  async _executeCreate(args) {
    this.log(`Creating ${args.workflowType}...`, 'verbose');

    try {
      const workflowPath = this.getWorkflowPath(COMMANDS.CREATE, args.workflowType);
      this.log(`Using workflow: ${workflowPath}`, 'verbose');

      // Load and execute workflow
      const { WorkflowEngine } = require('./workflow-engine.cjs');
      const engine = new WorkflowEngine(workflowPath, {
        checkpointDir: this.options.checkpointDir,
      });

      await engine.load();

      // Store active workflow
      const runId = engine.state.runId || `run-${Date.now()}`;
      this._activeWorkflows.set(runId, engine);

      // Execute
      const result = await engine.execute({
        name: args.options.name,
        type: args.options.type,
        ...args.options,
      });

      return {
        success: true,
        workflowType: args.workflowType,
        result,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
      };
    }
  }

  /**
   * Execute update command
   * @private
   */
  async _executeUpdate(args) {
    this.log(`Updating ${args.workflowType}...`, 'verbose');

    try {
      const workflowPath = this.getWorkflowPath(COMMANDS.UPDATE, args.workflowType);
      this.log(`Using workflow: ${workflowPath}`, 'verbose');

      // Load and execute workflow
      const { WorkflowEngine } = require('./workflow-engine.cjs');
      const engine = new WorkflowEngine(workflowPath, {
        checkpointDir: this.options.checkpointDir,
      });

      await engine.load();

      // Execute
      const result = await engine.execute({
        name: args.options.name,
        changes: args.options.changes,
        ...args.options,
      });

      return {
        success: true,
        workflowType: args.workflowType,
        result,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
      };
    }
  }

  /**
   * Execute resume command
   * @private
   */
  async _executeResume(args) {
    this.log(`Resuming from checkpoint: ${args.checkpointId}`, 'verbose');

    try {
      const { CheckpointManager } = require('./checkpoint-manager.cjs');
      const checkpointManager = new CheckpointManager({
        checkpointDir: this.options.checkpointDir,
      });

      // Load checkpoint
      const checkpoint = await checkpointManager.load(args.checkpointId);
      this.log(`Loaded checkpoint: ${JSON.stringify(checkpoint, null, 2)}`, 'verbose');

      return {
        success: false,
        resumed: false,
        reason: 'resume_not_implemented',
        checkpoint,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
      };
    }
  }

  /**
   * Execute list command
   * @private
   */
  async _executeList(_args) {
    const workflows = await this.listWorkflows();

    // Group by type
    const creators = workflows.filter(w => w.type === 'creator');
    const updaters = workflows.filter(w => w.type === 'updater');

    return {
      success: true,
      workflows: {
        creators,
        updaters,
        total: workflows.length,
      },
    };
  }

  /**
   * Execute status command
   * @private
   */
  async _executeStatus(args) {
    // Check active workflows
    if (this._activeWorkflows.has(args.workflowId)) {
      const engine = this._activeWorkflows.get(args.workflowId);
      return {
        success: true,
        status: engine.getState(),
      };
    }

    // Check checkpoints for paused workflows
    try {
      const { CheckpointManager } = require('./checkpoint-manager.cjs');
      const checkpointManager = new CheckpointManager({
        checkpointDir: this.options.checkpointDir,
      });

      const checkpoints = await checkpointManager.list(args.workflowId);

      return {
        success: true,
        status: 'paused',
        checkpoints: checkpoints.map(c => ({
          id: c.id,
          phase: c.phase,
          createdAt: c.createdAt,
        })),
      };
    } catch (_e) {
      return {
        success: false,
        error: `Workflow not found: ${args.workflowId}`,
      };
    }
  }

  /**
   * Execute rollback command
   * @private
   */
  async _executeRollback(args) {
    this.log(`Rolling back workflow: ${args.workflowId}`, 'verbose');

    // Check active workflows
    if (this._activeWorkflows.has(args.workflowId)) {
      const engine = this._activeWorkflows.get(args.workflowId);
      await engine.rollback();

      return {
        success: true,
        rolledBack: true,
        workflowId: args.workflowId,
      };
    }

    return {
      success: false,
      error: `Active workflow not found: ${args.workflowId}`,
    };
  }

  /**
   * Get help text
   *
   * @returns {string} Help text
   */
  getHelp() {
    return `
Workflow CLI - Execute EVOLVE workflows from the command line

USAGE:
  node workflow-cli.cjs <command> [options]

COMMANDS:
  create <type>     Execute a creator workflow (agent, skill, hook, workflow, template, schema)
  update <type>     Execute an updater workflow
  resume <id>       Resume a paused workflow from a checkpoint
  list              List all available workflows
  status <id>       Show status of a workflow
  rollback <id>     Rollback a failed workflow

OPTIONS:
  --name, -n        Name of the artifact to create/update
  --type, -t        Type/category of the artifact
  --changes, -c     Description of changes for update workflows
  --dry-run         Show what would be executed without running
  --verbose, -v     Enable verbose output
  --help, -h        Show this help message

EXAMPLES:
  # Create a new agent
  node workflow-cli.cjs create agent --name my-agent --type domain

  # Update a skill
  node workflow-cli.cjs update skill --name tdd --changes "add new pattern"

  # Resume from checkpoint
  node workflow-cli.cjs resume chk-1234567890-abc123

  # List all workflows
  node workflow-cli.cjs list

  # Check workflow status
  node workflow-cli.cjs status run-1234567890-xyz789

  # Rollback a workflow
  node workflow-cli.cjs rollback run-1234567890-xyz789

WORKFLOW TYPES:
  agent     - Create/update agent definitions
  skill     - Create/update skill definitions
  hook      - Create/update hooks
  workflow  - Create/update workflow definitions
  template  - Create/update templates
  schema    - Create/update JSON schemas
`;
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  // Parse arguments (skip node and script path)
  const args = parseArgs(process.argv.slice(2));

  // Create CLI instance
  const cli = new WorkflowCLI();

  // Run
  const result = await cli.run(args);

  // Output result
  if (result.help) {
    console.log(result.help);
  } else if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  } else if (result.dryRun) {
    console.log('Dry run mode - would execute:');
    console.log(JSON.stringify(result.wouldExecute, null, 2));
  } else if (result.workflows) {
    console.log('\nAvailable Workflows:');
    console.log('====================\n');
    console.log('Creator Workflows:');
    for (const w of result.workflows.creators) {
      console.log(`  - ${w.name} (${w.path})`);
    }
    console.log('\nUpdater Workflows:');
    for (const w of result.workflows.updaters) {
      console.log(`  - ${w.name} (${w.path})`);
    }
    console.log(`\nTotal: ${result.workflows.total} workflows`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  WorkflowCLI,
  parseArgs,
  COMMANDS,
  WORKFLOW_TYPES,
  DEFAULT_PATHS,
};
