/**
 * Agent Factory (SPEC-030)
 * ========================
 *
 * Centralized factory for creating specialized agents.
 * Abstracts the instantiation logic and dependency injection.
 */

'use strict';

const { DeveloperAgent } = require('./developer/index.cjs');
const { ArchitectAgent } = require('./architect/index.cjs');
const { QAAgent } = require('./qa/index.cjs');
const { ModelClient } = require('../clients/model-client.cjs');

class AgentFactory {
    /**
     * Create a specialized agent.
     *
     * @param {string} type - 'developer', 'architect', or 'qa'
     * @param {Object} config - Agent configuration (tools, model, etc.)
     * @returns {BaseAgent} - Instance of the requested agent
     */
    static createAgent(type, config = {}) {
        // Ensure ModelClient is present
        if (!config.modelClient) {
            config.modelClient = new ModelClient(config.model || {});
        }
        // Ensure Memory is present (optional, can be null)
        if (!config.memory && config.context && config.context.memory) {
            config.memory = config.context.memory;
        }
        switch (type.toLowerCase()) {
            case 'developer':
                return new DeveloperAgent(config);
            case 'architect':
                return new ArchitectAgent(config);
            case 'qa':
                return new QAAgent(config);
            default:
                throw new Error(`Unknown agent type: ${type}. Available types: developer, architect, qa`);
        }
    }

    /**
     * Get list of supported agent types.
     * @returns {string[]}
     */
    static getAvailableAgentTypes() {
        return ['developer', 'architect', 'qa'];
    }
}

module.exports = { AgentFactory };
