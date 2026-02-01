/**
 * Architect Agent (SPEC-028)
 * ==========================
 *
 * Specialized agent for high-level technical planning.
 * Optimized for:
 * - Analyzing codebase structure (Read-Only)
 * - Decomposing complex requests into granular tasks
 * - Estimating complexity
 */

'use strict';

const { BaseAgent } = require('../base-agent.cjs');

class ArchitectAgent extends BaseAgent {
    constructor(config = {}) {
        super(config);
        this.name = 'ArchitectAgent';
    }

    /**
     * Decompose a high-level request into specific tasks.
     * @param {string} userRequest - The complex user request
     * @returns {Promise<Object>} - The decomposition plan
     */
    async resolveTask(userRequest) {
        // Step 1: Analyze context (if tools available)
        let context = 'No file access.';
        if (this.tools.listFiles) {
            try {
                const files = await this._useTool('listFiles', { path: '.' });
                context = `Project Structure: ${JSON.stringify(files)}`;
            } catch (e) {
                context = `Error reading files: ${e.message}`;
            }
        }

        // Step 2: Generate Plan
        const plan = await this._generatePlan(userRequest, context);

        return {
            status: 'success',
            originalRequest: userRequest,
            tasks: plan.tasks,
            summary: plan.summary
        };
    }

    /**
     * Calls LLM to break down the task.
     */
    async _generatePlan(request, context) {
        const systemPrompt = `You are an expert Software Architect.
Your goal is to break down a complex user request into small, specific implementation tasks for a Developer Agent.
The Developer Agent can only edit code and run tests. It cannot "plan" a whole feature.

Context:
${context}

Output a JSON object with:
- summary: string (high level approach)
- tasks: Array<{ title: string, description: string, expectedFiles: string[] }>
`;

        const response = await this._think(systemPrompt, request);

        try {
            return JSON.parse(response);
        } catch (e) {
            throw new Error(`Failed to parse architect plan: ${e.message}`);
        }
    }
}

module.exports = { ArchitectAgent };
