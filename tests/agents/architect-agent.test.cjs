/**
 * Architect Agent Tests
 * =====================
 *
 * Verifies the Architect Agent's ability to:
 * 1. Analyze context (mocked file listing).
 * 2. Decompose requests into tasks (mocked LLM).
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

// Robust import to handle path resolution
const agentPath = path.join(__dirname, '../../.claude/lib/agents/architect/index.cjs');
console.log('Loading ArchitectAgent from:', agentPath);
const { ArchitectAgent } = require(agentPath);

describe('ArchitectAgent', () => {
    let agent;
    let tools;

    beforeEach(() => {
        tools = {
            listFiles: async () => ['src/index.js', 'package.json']
        };
        agent = new ArchitectAgent({ tools });
    });

    it('should decompose a request into tasks', async () => {
        // Mock LLM
        agent._think = async () => JSON.stringify({
            summary: 'Build a login feature',
            tasks: [
                { title: 'Task 1', description: 'Create DB', expectedFiles: ['db.js'] },
                { title: 'Task 2', description: 'Create API', expectedFiles: ['api.js'] }
            ]
        });

        const result = await agent.resolveTask('Build login');

        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.tasks.length, 2);
        assert.strictEqual(result.tasks[0].title, 'Task 1');
    });

    it('should handle tool errors gracefully', async () => {
        // Mock failing tool
        agent.tools.listFiles = async () => { throw new Error('Permission denied'); };

        agent._think = async (sys, _user) => {
            // Verify system prompt mentions error
            if (sys.includes('Error reading files')) {
                return JSON.stringify({ summary: 'Plan without files', tasks: [] });
            }
            return JSON.stringify({ summary: 'Failed', tasks: [] });
        };

        const result = await agent.resolveTask('Do something');
        assert.strictEqual(result.summary, 'Plan without files');
    });
});
