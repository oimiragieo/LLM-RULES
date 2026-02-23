/**
 * Orchestrator Tool
 * =================
 *
 * Exposes the OrchestratorService as a tool for the Router or other agents.
 * Allows delegating complex tasks to the Architect -> Developer -> QA pipeline.
 *
 * Usage:
 * Orchestrator({ task: "Build a todo app" })
 */

'use strict';

const { OrchestratorService } = require('../agents/orchestrator.cjs');
const { ContextualMemory } = require('../memory/contextual-memory.cjs');
const { StandardTools } = require('./standard-tools.cjs');

// Singleton instance
let orchestratorService = null;

/**
 * Get or create the OrchestratorService singleton
 */
function getService() {
  if (!orchestratorService) {
    // Inject standard tools (Read, Write, etc.) into the service
    // so specialized agents can use them.
    orchestratorService = new OrchestratorService({
      tools: StandardTools,
    });
  }
  return orchestratorService;
}

/**
 * Orchestrator Tool Function
 *
 * @param {Object} args
 * @param {string} args.task - The high-level task description
 * @returns {Promise<Object>} The result of the orchestration
 */
async function Orchestrator({ task }) {
  if (!task) {
    throw new Error('Task argument is required for Orchestrator tool');
  }

  console.log(`[OrchestratorTool] Received task: "${task}"`);

  const service = getService();

  // Initialize real memory system for the agents
  const memory = new ContextualMemory();

  try {
    // Execute the task pipeline
    // context.changedFiles is not strictly required for the initial call,
    // agents will discover files via tools.
    const result = await service.processTask(task, {
      memory,
      changedFiles: [],
    });

    // summarize result for the tool output
    return {
      status: 'success',
      agent: result.agent,
      output: result.result,
      subTasks: result.subResults ? result.subResults.length : 0,
    };
  } catch (error) {
    console.error('[OrchestratorTool] Error:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

module.exports = { Orchestrator };
