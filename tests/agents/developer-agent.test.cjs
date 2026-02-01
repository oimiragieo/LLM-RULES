/**
 * Developer Agent Tests
 * =====================
 *
 * Verifies the Developer Agent's ability to:
 * 1. Plan modifications based on a task.
 * 2. Execute file edits.
 * 3. Run verification commands.
 */

'use strict';

const assert = require('assert');
const { describe, it, beforeEach } = require('node:test');
const { DeveloperAgent } = require('../../.claude/lib/agents/developer/index.cjs');

describe('DeveloperAgent', () => {
    let agent;
    let tools;
    let mockFileStore = {};
    let mockExecLog = [];

    beforeEach(() => {
        mockFileStore = {};
        mockExecLog = [];

        tools = {
            writeFile: async ({ file, content }) => {
                mockFileStore[file] = content;
                return { success: true };
            },
            exec: async ({ command }) => {
                mockExecLog.push(command);
                return { stdout: 'Tests passed', stderr: '', exitCode: 0 };
            }
        };

        agent = new DeveloperAgent({ tools });
    });

    it('should resolve a task by planning, editing, and verifying', async () => {
        // Mock the LLM response (JSON plan)
        agent._think = async (_system, _user) => {
            return JSON.stringify({
                explanation: 'Fixing the bug',
                actions: [
                    { type: 'edit', file: 'app.js', content: 'console.log("Fixed");' }
                ],
                verificationCommand: 'npm test'
            });
        };

        const result = await agent.resolveTask('Fix the bug in app.js');

        // Assertions
        assert.strictEqual(result.status, 'success');
        assert.strictEqual(mockFileStore['app.js'], 'console.log("Fixed");', 'File should be written');
        assert.ok(mockExecLog.includes('npm test'), 'Verification command should run');
    });

    it('should handle verification failures', async () => {
        // Mock failure tools
        agent.tools.exec = async () => ({ stdout: '', stderr: 'Error', exitCode: 1 });

        agent._think = async () => JSON.stringify({
            actions: [],
            verificationCommand: 'npm test'
        });

        const result = await agent.resolveTask('Run tests');

        assert.strictEqual(result.status, 'failure');
        assert.strictEqual(result.verification.passed, false);
    });
});
