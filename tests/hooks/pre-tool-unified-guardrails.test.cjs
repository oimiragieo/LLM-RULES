const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  checkAgentGuardrails,
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('pre-tool-unified agent guardrails', () => {
  function withTempGuardrailState(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-guardrails-'));
    const stateFile = path.join(tempDir, 'agent-guardrails-state.json');
    const envBackup = {
      AGENT_GUARDRAIL_ENFORCEMENT: process.env.AGENT_GUARDRAIL_ENFORCEMENT,
      AGENT_GIT_COMMIT_ENFORCEMENT: process.env.AGENT_GIT_COMMIT_ENFORCEMENT,
      AGENT_FILE_ALLOWLIST_ENFORCEMENT: process.env.AGENT_FILE_ALLOWLIST_ENFORCEMENT,
      AGENT_EDIT_CHECKPOINT_ENFORCEMENT: process.env.AGENT_EDIT_CHECKPOINT_ENFORCEMENT,
      TASKUPDATE_FIRST_ENFORCEMENT: process.env.TASKUPDATE_FIRST_ENFORCEMENT,
    };

    process.env.AGENT_GUARDRAIL_ENFORCEMENT = 'block';
    process.env.AGENT_GIT_COMMIT_ENFORCEMENT = 'block';
    process.env.AGENT_FILE_ALLOWLIST_ENFORCEMENT = 'block';
    process.env.AGENT_EDIT_CHECKPOINT_ENFORCEMENT = 'block';
    process.env.TASKUPDATE_FIRST_ENFORCEMENT = 'off';

    try {
      fn(stateFile);
    } finally {
      for (const [k, v] of Object.entries(envBackup)) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  function seedSession(stateFile, sessionId, policy = {}) {
    const base = {
      sessions: {
        [sessionId]: {
          taskId: 'task-1',
          allowGitCommit: false,
          allowedFiles: ['.claude/hooks/routing/pre-tool-unified.cjs'],
          firstMutationSeen: false,
          checkpointDone: false,
          touchedFiles: [],
          updatedAt: Date.now(),
          ...policy,
        },
      },
    };
    writeAgentGuardrailsState(base, stateFile);
  }

  test('blocks git commit when policy does not allow it', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-1');
      const hookInput = {
        session_id: 'session-1',
        allowed_tools: ['TaskUpdate', 'Bash', 'Edit'],
      };
      const result = checkAgentGuardrails(
        hookInput,
        'Bash',
        { command: 'git commit -m "x"' },
        stateFile
      );
      assert.equal(result.action, 'block');
      assert.match(result.message, /blocked unless explicitly allowed/);
    });
  });

  test('allows git commit when allowGitCommit policy is true', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-2', { allowGitCommit: true });
      const hookInput = {
        session_id: 'session-2',
        allowed_tools: ['TaskUpdate', 'Bash', 'Edit'],
      };
      const result = checkAgentGuardrails(
        hookInput,
        'Bash',
        { command: 'git commit -m "x"' },
        stateFile
      );
      assert.equal(result.action, 'allow');
    });
  });

  test('enforces allowlist for file mutations', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-3', {
        allowedFiles: ['tests/hooks'],
      });
      const hookInput = {
        session_id: 'session-3',
        allowed_tools: ['TaskUpdate', 'Edit', 'Write'],
      };
      const result = checkAgentGuardrails(
        hookInput,
        'Edit',
        { file_path: '.claude/hooks/routing/pre-tool-unified.cjs' },
        stateFile
      );
      assert.equal(result.action, 'block');
      assert.match(result.message, /outside the assigned allowlist/);
    });
  });

  test('requires checkpoint after first mutation before second mutation', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-4', {
        allowedFiles: ['tests/hooks'],
      });
      const hookInput = {
        session_id: 'session-4',
        allowed_tools: ['TaskUpdate', 'Edit', 'Bash'],
      };

      const first = checkAgentGuardrails(
        hookInput,
        'Edit',
        { file_path: 'tests/hooks/pre-tool-unified-guardrails.test.cjs' },
        stateFile
      );
      assert.equal(first.action, 'allow');
      assert.match(first.warning || '', /First mutation recorded/);

      const second = checkAgentGuardrails(
        hookInput,
        'Edit',
        { file_path: 'tests/hooks/pre-task-unified.test.cjs' },
        stateFile
      );
      assert.equal(second.action, 'block');
      assert.match(second.message, /Missing checkpoint/);

      const checkpoint = checkAgentGuardrails(
        hookInput,
        'Bash',
        { command: 'git diff --name-only' },
        stateFile
      );
      assert.equal(checkpoint.action, 'allow');

      const third = checkAgentGuardrails(
        hookInput,
        'Edit',
        { file_path: 'tests/hooks/pre-task-unified.test.cjs' },
        stateFile
      );
      assert.equal(third.action, 'allow');
    });
  });

  test('reads/writes guardrail state file safely', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-5');
      const loaded = readAgentGuardrailsState(stateFile);
      assert.ok(loaded.sessions['session-5']);
    });
  });
});
