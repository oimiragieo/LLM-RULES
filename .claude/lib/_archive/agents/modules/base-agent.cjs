/**
 * Base Agent Class
 * ================
 *
 * Foundation for all specialized agents in Phase 6.
 * Provides:
 * - Tool registration
 * - Task resolution structure
 * - Abstract reasoning interface
 */

'use strict';

class BaseAgent {
  /**
   * @param {Object} config - Agent configuration
   * @param {Object} config.tools - Dictionary of available tools
   * @param {Object} config.model - Model configuration (name, temperature)
   */
  constructor(config = {}) {
    this.tools = config.tools || {};
    this.modelConfig = config.model || { name: 'claude-3-5-sonnet', temperature: 0 };
    this.history = []; // Conversation history
    this.modelClient = config.modelClient;
    this.memory = config.memory; // ContextualMemory instance
  }

  /**
   * Main entry point for the agent to resolve a task.
   * @param {string} taskDescription - The user's request
   * @returns {Promise<Object>} - The result of the task
   */
  async resolveTask(_taskDescription) {
    throw new Error('resolveTask must be implemented by subclass');
  }

  /**
   * Internal reasoning step. Calls the LLM.
   * @param {string} systemPrompt - The persona/instructions
   * @param {string} userPrompt - The specific input
   * @returns {Promise<string>} - The LLM's response text
   */
  async _think(systemPrompt, userPrompt) {
    if (this.modelClient) {
      // Use Real Intelligence
      return this.modelClient.generateText({
        system: systemPrompt,
        messages: userPrompt,
      });
    }

    // Fallback for legacy tests that didn't inject client
    // console.warn(`[${this.name}] No ModelClient injected. Using legacy mock throw/override.`);
    // throw new Error('_think method is abstract and must be mocked or implemented with an LLM client.');

    // Actually, let's allow it to fail if not mocked in subclass,
    // OR return a semantic mock if we want development to be easier.
    // For now, let's return a default mock string to avoid breaking existing tests
    // that might rely on the specific mock override in the test file itself.
    // If the test OVERRODE _think, this method won't be called anyway.

    throw new Error(`[${this.name}] No ModelClient injected and _think not mocked.`);
  }

  /**
   * Helper to search agent memory.
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Search results
   */
  async searchMemory(query, options) {
    if (!this.memory) {
      return [];
    }
    return this.memory.search(query, options);
  }

  /**
   * Execute a tool by name.
   * @param {string} toolName - Name of the tool
   * @param {Object} args - Arguments for the tool
   * @returns {Promise<any>} - Tool output
   */
  async _useTool(toolName, args) {
    if (!this.tools[toolName]) {
      throw new Error(`Tool "${toolName}" not found.`);
    }
    return this.tools[toolName](args);
  }
}

module.exports = { BaseAgent };
