/**
 * QA Agent Tests
 * ==============
 *
 * Verifies the QA Agent's ability to:
 * 1. Plan tests based on changes.
 * 2. Generate test files.
 * 3. Execute and report results.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

// Robust import
const agentPath = path.join(__dirname, '../../.claude/lib/agents/qa/index.cjs');
const { QAAgent } = require(agentPath);

describe('QAAgent', () => {
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
                return { stdout: '✔ pass', stderr: '', exitCode: 0 };
            }
        };

        agent = new QAAgent({ tools });
    });

    it('should full cycle: plan, write, and run tests', async () => {
        // Mock LLM
        agent._think = async () => JSON.stringify({
            explanation: 'Verify login',
            tests: [
                { filename: 'tests/login.test.cjs', content: '// test code' }
            ]
        });

        const result = await agent.resolveTask('Add login', ['auth.js']);

        // Check if test file was written
        assert.ok(mockFileStore['tests/login.test.cjs']);
        assert.strictEqual(mockFileStore['tests/login.test.cjs'], '// test code');

        // Check if test was run
        assert.ok(mockExecLog.some(cmd => cmd.includes('node --test tests/login.test.cjs')));

        assert.strictEqual(result.status, 'success');
    });

    it('should handle empty test plans', async () => {
        agent._think = async () => JSON.stringify({
            explanation: 'No tests needed',
            tests: []
        });

        const result = await agent.resolveTask('Update readme', ['README.md']);
        assert.strictEqual(result.status, 'skipped');
    });

    it('should report failures', async () => {
        // Mock failing test run
        agent.tools.exec = async () => ({ stdout: '✖ fail', stderr: '', exitCode: 1 });

        agent._think = async () => JSON.stringify({
            tests: [{ filename: 'tests/fail.test.cjs', content: '// fail' }]
        });

        const result = await agent.resolveTask('Break things');
        assert.strictEqual(result.status, 'failure');
        assert.strictEqual(result.results.allPassed, false);
    });
});
