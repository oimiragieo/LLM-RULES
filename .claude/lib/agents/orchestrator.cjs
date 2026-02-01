/**
 * Orchestrator Service (SPEC-031)
 * ===============================
 *
 * Routes user tasks to specialized agents using the Agent Factory.
 * Acts as the main entry point for the agent framework.
 */

'use strict';

const { AgentFactory } = require('./factory.cjs');

class OrchestratorService {
  constructor(config = {}) {
    this.config = config;
    this.tools = config.tools || {};
  }

  /**
   * Process a user request by routing it to the appropriate agent.
   *
   * @param {string} task - The user's request
   * @param {Object} context - Optional context (e.g., changed files)
   * @returns {Promise<Object>} - The result from the agent
   */
  async processTask(task, context = {}) {
    // console.log(`[Orchestrator] Processing task: "${task}"`);

    // 1. Route Task
    const agentType = this._routeTask(task);
    // console.log(`[Orchestrator] Routing to: ${agentType}`);

    // 2. Create Agent
    const agent = AgentFactory.createAgent(agentType, {
      tools: this.tools,
      model: this.config.model,
      memory: context.memory, // Inject Memory
    });

    // 3. Execute
    // Developer and QA might need extra context args
    // For now, we pass task and context.changedFiles if available
    let result;
    if (agentType === 'qa') {
      result = await agent.resolveTask(task, context.changedFiles || []);
    } else {
      result = await agent.resolveTask(task);
    }

    // 4. Recursive Execution (Chain of Thought)
    const subResults = [];
    if (agentType === 'architect' && result.tasks && Array.isArray(result.tasks)) {
      console.log(
        `[Orchestrator] Architect returned ${result.tasks.length} sub-tasks. Executing...`
      );
      for (const subTask of result.tasks) {
        // Construct a sub-task string or object.
        // Architect returns { title, description, expectedFiles }
        const subTaskString = `${subTask.title}: ${subTask.description}`;
        const subResult = await this.processTask(subTaskString, context);
        subResults.push(subResult);
      }
    }

    return {
      task,
      agent: agentType,
      result,
      subResults, // Include sub-results in the output
    };
  }

  /**
   * Determine the best agent for the task.
   * Simple heuristic for Phase 7.
   */
  _routeTask(task) {
    const t = task.toLowerCase();

    if (t.includes('test') || t.includes('verify') || t.includes('qa') || t.includes('check')) {
      return 'qa';
    }

    if (
      t.includes('plan') ||
      t.includes('design') ||
      t.includes('architecture') ||
      t.includes('break down')
    ) {
      return 'architect';
    }

    // Default to Developer for "fix", "create", "update", "implement"
    return 'developer';
  }
}

module.exports = { OrchestratorService };
