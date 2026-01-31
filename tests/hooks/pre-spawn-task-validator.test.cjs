/**
 * @file Pre-Spawn Task Validator Hook Tests
 * @description Tests for task tracking enforcement hook that blocks spawns without TaskCreate
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Hook will be implemented at: .claude/hooks/routing/pre-spawn-task-validator.cjs

test('Pre-Spawn Task Validator - RED Phase Tests', async (t) => {
  let hookPath;
  let tempDir;

  t.beforeEach(() => {
    // Setup temp directory for test state files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-validator-'));
    hookPath = path.join(process.cwd(), '.claude/hooks/routing/pre-spawn-task-validator.cjs');
  });

  t.afterEach(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('1. Hook module exports PreToolUse function', () => {
    // GREEN: Hook should exist now
    assert.strictEqual(fs.existsSync(hookPath), true, 'Hook file exists');
    const hook = require(hookPath);
    assert.strictEqual(typeof hook.PreToolUse, 'function', 'PreToolUse function exported');
  });

  await t.test('2. Blocks spawn when no TaskCreate exists for work', async () => {
    // GREEN: Hook blocks spawn without tasks.json
    const hook = require(hookPath);
    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'Implement feature X',
        description: 'Developer implementing feature X'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    assert.strictEqual(result.allowed, false, 'Spawn blocked');
    assert.ok(result.reason.includes('No tasks file found'), 'Reason mentions missing tasks file');
  });

  await t.test('3. Allows spawn when matching TaskCreate exists', async () => {
    // GREEN: Hook allows spawn when task ID matches
    const hook = require(hookPath);
    const taskFile = path.join(tempDir, '.claude/context/tasks.json');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, JSON.stringify({
      tasks: [{
        id: '72',
        subject: 'Implement feature X',
        status: 'pending',
        description: 'Implement feature X with TDD'
      }]
    }));

    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'You are implementing Task #72: Implement feature X',
        description: 'Developer implementing feature X'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    assert.strictEqual(result.allowed, true, 'Spawn allowed when task exists');
  });

  await t.test('4. Extracts task ID from spawn prompt', async () => {
    // GREEN: Test task ID extraction patterns
    const hook = require(hookPath);

    // Create tasks file for testing
    const taskFile = path.join(tempDir, '.claude/context/tasks.json');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, JSON.stringify({
      tasks: [
        { id: '72', subject: 'Test 1', status: 'pending' },
        { id: '123', subject: 'Test 2', status: 'pending' },
        { id: '456', subject: 'Test 3', status: 'pending' }
      ]
    }));

    const testCases = [
      { prompt: 'You are implementing Task #72', expectedId: '72', shouldPass: true },
      { prompt: 'Your Task ID: 123', expectedId: '123', shouldPass: true },
      { prompt: 'Working on task #456', expectedId: '456', shouldPass: true },
      { prompt: 'No task ID here', expectedId: null, shouldPass: false }
    ];

    for (const testCase of testCases) {
      const result = await hook.PreToolUse({
        tool: 'Task',
        parameters: { prompt: testCase.prompt },
        context: { PROJECT_ROOT: tempDir }
      });

      if (testCase.shouldPass) {
        assert.strictEqual(result.allowed, true, `Should extract ID from: ${testCase.prompt}`);
      } else {
        assert.strictEqual(result.allowed, false, `Should fail without ID: ${testCase.prompt}`);
      }
    }
  });

  await t.test('5. Provides clear error message when blocking', async () => {
    // GREEN: Verify error message clarity
    const hook = require(hookPath);
    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'Do some work',
        description: 'Generic work'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    assert.strictEqual(result.allowed, false, 'Spawn blocked');
    assert.ok(result.reason.includes('TaskCreate'), 'Mentions TaskCreate');
    assert.ok(result.reason.toLowerCase().includes('task'), 'Mentions task concept');
  });

  await t.test('6. Logs spawn attempt to audit trail', async () => {
    // GREEN: Verify audit logging
    const hook = require(hookPath);
    const auditLog = path.join(tempDir, '.claude/context/metrics/spawn-audit.jsonl');

    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'Task #72: Implement X',
        description: 'Developer work'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    await hook.PreToolUse(mockInput);

    assert.ok(fs.existsSync(auditLog), 'Audit log file created');
    const logContent = fs.readFileSync(auditLog, 'utf8');
    const logLines = logContent.trim().split('\n');
    assert.ok(logLines.length > 0, 'At least one log entry');

    const entry = JSON.parse(logLines[0]);
    assert.ok(entry.timestamp, 'Has timestamp');
    assert.strictEqual(entry.tool, 'Task', 'Logs tool name');
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'allowed'), 'Logs allowed status');
    assert.strictEqual(entry.agentType, 'developer', 'Logs agent type');
  });

  await t.test('7. Handles missing tasks.json gracefully', async () => {
    // GREEN: Block gracefully when tasks.json missing
    const hook = require(hookPath);
    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'Task #72: Work',
        description: 'Work'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    assert.strictEqual(result.allowed, false, 'Blocked when no tasks.json');
    assert.ok(result.reason.includes('No tasks file'), 'Error mentions missing tasks file');
  });

  await t.test('8. Respects --no-track flag override', async () => {
    // GREEN: Allow spawn with override flag
    const hook = require(hookPath);
    process.env.NO_TRACK_ENFORCEMENT = 'true';

    const mockInput = {
      tool: 'Task',
      parameters: {
        subagent_type: 'developer',
        prompt: 'Work without task',
        description: 'Emergency work'
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    delete process.env.NO_TRACK_ENFORCEMENT;

    assert.strictEqual(result.allowed, true, 'Spawn allowed with override');
    assert.ok(result.reason && result.reason.includes('override'), 'Reason mentions override');
  });

  await t.test('9. Only validates Task tool, not other tools', async () => {
    // GREEN: Allow all non-Task tools immediately
    const hook = require(hookPath);
    const nonTaskTools = [
      { tool: 'Read', parameters: { file_path: 'test.js' } },
      { tool: 'Write', parameters: { file_path: 'test.js', content: 'x' } },
      { tool: 'Bash', parameters: { command: 'ls' } },
      { tool: 'TaskCreate', parameters: { subject: 'New task' } }
    ];

    for (const toolCall of nonTaskTools) {
      const result = await hook.PreToolUse({
        ...toolCall,
        context: { PROJECT_ROOT: tempDir }
      });
      assert.strictEqual(result.allowed, true, `${toolCall.tool} should be allowed immediately`);
    }
  });

  await t.test('10. Matches task by description keywords when no ID found', async () => {
    // GREEN: Keyword matching when no explicit task ID
    const hook = require(hookPath);
    const taskFile = path.join(tempDir, '.claude/context/tasks.json');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, JSON.stringify({
      tasks: [{
        id: '72',
        subject: 'Implement authentication feature',
        status: 'pending',
        description: 'Add JWT auth to API'
      }]
    }));

    const mockInput = {
      tool: 'Task',
      parameters: {
        prompt: 'You are implementing authentication with JWT for the API',
        description: 'Implement authentication feature with JWT for API' // Better keyword match
      },
      context: {
        PROJECT_ROOT: tempDir
      }
    };

    const result = await hook.PreToolUse(mockInput);
    if (!result.allowed) {
      console.log('DEBUG: Keyword matching failed. Reason:', result.reason);
    }
    assert.strictEqual(result.allowed, true, 'Should match task by keywords');
  });
});
