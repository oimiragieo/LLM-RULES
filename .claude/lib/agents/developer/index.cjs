/**
 * Developer Agent (SPEC-027)
 * ==========================
 *
 * Specialized agent for code modification tasks.
 * Optimized for:
 * - Reading code context
 * - Planning edits
 * - Applying changes
 * - Verifying with tests
 */

'use strict';

const { BaseAgent } = require('../base-agent.cjs');

class DeveloperAgent extends BaseAgent {
    constructor(config = {}) {
        super(config);
        this.name = 'DeveloperAgent';
    }

    /**
     * Resolve a coding task.
     * Format:
     * 1. Analyze context (read files).
     * 2. Plan changes.
     * 3. Apply changes.
     * 4. Verify.
     */
    async resolveTask(taskDescription) {
        // Step 1: Plan
        const plan = await this._planModifications(taskDescription);

        // Step 2: Apply
        const results = [];
        for (const action of plan.actions) {
            if (action.type === 'edit') {
                const result = await this._applyChanges(action.file, action.content);
                results.push(result);
            }
        }

        // Step 3: Verify (if test provided)
        let verification = { passed: true, message: 'No verification step in plan.' };
        if (plan.verificationCommand) {
            verification = await this._verify(plan.verificationCommand);
        }

        return {
            status: verification.passed ? 'success' : 'failure',
            plan,
            results,
            verification
        };
    }

    /**
     * Generates a modification plan using the LLM.
     */
    async _planModifications(task) {
        const systemPrompt = `You are an expert Developer Agent.
Your goal is to modify code to satisfy a requirement.
Output a JSON object with:
- explanation: string
- actions: Array<{ type: 'edit', file: string, content: string }>
- verificationCommand: string (optional command to run tests)
`;

        const response = await this._think(systemPrompt, task);

        try {
            // Basic JSON parsing (in production, use a safe parser or output validation)
            return JSON.parse(response);
        } catch (e) {
            throw new Error(`Failed to parse plan from LLM: ${e.message}`);
        }
    }

    /**
     * Applies changes to a file.
     */
    async _applyChanges(file, content) {
        // Use the 'writeFile' tool inherited from BaseAgent config
        return this._useTool('writeFile', { file, content });
    }

    /**
     * Runs a verification command.
     */
    async _verify(command) {
        try {
            // Use 'exec' tool
            const output = await this._useTool('exec', { command });
            // Naive check: if exit code is 0 (implied by no error throw usually), strictly standard logic depends on tool implementation.
            // Assuming tool returns { stdout, stderr, exitCode }
            if (output.exitCode === 0) {
                return { passed: true, message: output.stdout };
            }
            return { passed: false, message: output.stderr || output.stdout };
        } catch (e) {
            return { passed: false, message: e.message };
        }
    }
}

module.exports = { DeveloperAgent };
