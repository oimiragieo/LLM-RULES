/**
 * End-to-End Pilot Test (SPEC-032)
 * ================================
 *
 * Verifies the full autonomous flow:
 * User Request -> Orchestrator -> Architect -> [Developer, QA] -> Success
 *
 * Scenario: "Create a calculator"
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

// Robust imports
const orchestratorPath = path.join(__dirname, '../../.claude/lib/agents/orchestrator.cjs');
const factoryPath = path.join(__dirname, '../../.claude/lib/agents/factory.cjs');
const { OrchestratorService } = require(orchestratorPath);
const { AgentFactory } = require(factoryPath);
const { BaseAgent } = require(path.join(__dirname, '../../.claude/lib/agents/base-agent.cjs'));

// --- Mock Agents ---

class MockArchitect extends BaseAgent {
    constructor(config) { super(config); this.name = 'ArchitectAgent'; }
    async resolveTask(_task) {
        // Return a plan with 2 sub-tasks
        return {
            status: 'success',
            tasks: [
                { title: 'Implement calculator', description: 'Write add/sub' },
                { title: 'Verify calculator', description: 'Run tests' }
            ],
            summary: 'Plan generated'
        };
    }
}

class MockDeveloper extends BaseAgent {
    constructor(config) { super(config); this.name = 'DeveloperAgent'; }
    async resolveTask(_task) {
        return { status: 'success', results: ['calc.js'] };
    }
}

class MockQA extends BaseAgent {
    constructor(config) { super(config); this.name = 'QAAgent'; }
    async resolveTask(_task, _changedFiles) {
        return { status: 'success', results: { allPassed: true } };
    }
}

describe('E2E Pilot: Create Calculator', () => {
    let orchestrator;
    let callLog = [];

    beforeEach(() => {
        callLog = [];
        orchestrator = new OrchestratorService();

        // Mock Factory to return our instrumented agents
        AgentFactory.createAgent = (type, config) => {
            callLog.push(`create:${type}`);
            switch (type) {
                case 'architect': return new MockArchitect(config);
                case 'developer': return new MockDeveloper(config);
                case 'qa': return new MockQA(config);
            }
        };
    });

    it('should recursively execute an Architect plan', async () => {
        const result = await orchestrator.processTask('Plan and create calculator');

        // Verify the high-level result
        assert.strictEqual(result.agent, 'architect');
        assert.strictEqual(result.result.status, 'success');

        // Verify Recursion:
        // 1. Architect created
        // 2. Developer created (Task 1)
        // 3. QA created (Task 2)

        // Check log order
        assert.deepStrictEqual(callLog, [
            'create:architect',
            'create:developer',
            'create:qa'
        ]);

        // Check result structure (Sub-results should be attached)
        // Note: Orchestrator needs to be updated to attach these!
        assert.ok(result.subResults, 'Orchestrator should return sub-task results');
        assert.strictEqual(result.subResults.length, 2);
        assert.strictEqual(result.subResults[0].agent, 'developer');
        assert.strictEqual(result.subResults[1].agent, 'qa');
    });
});
