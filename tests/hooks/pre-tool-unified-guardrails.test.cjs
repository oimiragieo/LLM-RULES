const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  checkBashArtifactWriteSafety,
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
      AGENT_BASH_POLL_GUARD: process.env.AGENT_BASH_POLL_GUARD,
      AGENT_BASH_ARTIFACT_WRITE_GUARD: process.env.AGENT_BASH_ARTIFACT_WRITE_GUARD,
      AGENT_WINDOWS_BASH_GUARD: process.env.AGENT_WINDOWS_BASH_GUARD,
      AGENT_BASH_POLL_REPEAT_THRESHOLD: process.env.AGENT_BASH_POLL_REPEAT_THRESHOLD,
      AGENT_BASH_POLL_STALE_MS: process.env.AGENT_BASH_POLL_STALE_MS,
      TASKUPDATE_FIRST_ENFORCEMENT: process.env.TASKUPDATE_FIRST_ENFORCEMENT,
    };

    process.env.AGENT_GUARDRAIL_ENFORCEMENT = 'block';
    process.env.AGENT_GIT_COMMIT_ENFORCEMENT = 'block';
    process.env.AGENT_FILE_ALLOWLIST_ENFORCEMENT = 'block';
    process.env.AGENT_EDIT_CHECKPOINT_ENFORCEMENT = 'block';
    process.env.AGENT_BASH_POLL_GUARD = 'block';
    process.env.AGENT_BASH_ARTIFACT_WRITE_GUARD = 'block';
    process.env.AGENT_WINDOWS_BASH_GUARD = 'block';
    process.env.AGENT_BASH_POLL_REPEAT_THRESHOLD = '3';
    process.env.AGENT_BASH_POLL_STALE_MS = '50';
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

  test('blocks polling when task output already has terminal test summary', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-6');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-output-'));
      const tasksDir = path.join(tempDir, 'tasks');
      fs.mkdirSync(tasksDir, { recursive: true });
      const outputPath = path.join(tasksDir, 'done.output');
      fs.writeFileSync(
        outputPath,
        '# tests 42\n# pass 40\n# fail 2\nELIFECYCLE Test failed. See above for more details.\n',
        'utf8'
      );

      const hookInput = {
        session_id: 'session-6',
        allowed_tools: ['TaskUpdate', 'Bash'],
      };
      const command = `cat "${outputPath}" | tail -30`;
      const result = checkAgentGuardrails(hookInput, 'Bash', { command }, stateFile);
      assert.equal(result.action, 'block');
      assert.match(result.message, /terminal test summary markers/i);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  test('blocks stale repeated task-output polling loops', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-7');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-output-'));
      const tasksDir = path.join(tempDir, 'tasks');
      fs.mkdirSync(tasksDir, { recursive: true });
      const outputPath = path.join(tasksDir, 'stale.output');
      fs.writeFileSync(outputPath, 'still running...\n', 'utf8');
      const staleDate = new Date(Date.now() - 2 * 60 * 1000);
      fs.utimesSync(outputPath, staleDate, staleDate);

      const hookInput = {
        session_id: 'session-7',
        allowed_tools: ['TaskUpdate', 'Bash'],
      };
      const command = `cat "${outputPath}" | grep -i fail | head -40`;

      const results = [];
      for (let i = 0; i < 6; i += 1) {
        results.push(checkAgentGuardrails(hookInput, 'Bash', { command }, stateFile));
      }

      assert.equal(results[0].action, 'allow');
      assert.equal(results[4].action, 'allow');
      assert.equal(results[5].action, 'block');
      assert.match(results[5].message, /stale task-output polling/i);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  test('blocks bash redirection writes to reports/memory artifacts', () => {
    withTempGuardrailState(stateFile => {
      seedSession(stateFile, 'session-8');
      const hookInput = {
        session_id: 'session-8',
        allowed_tools: ['TaskUpdate', 'Bash', 'Write'],
      };
      const result = checkAgentGuardrails(
        hookInput,
        'Bash',
        {
          command:
            'cat > "/c/dev/projects/agent-studio/.claude/context/reports/example.md" << \'EOF\'\nhello\nEOF',
        },
        stateFile
      );
      assert.equal(result.action, 'block');
      assert.match(
        result.message,
        /Bash redirection\/heredoc|Windows-incompatible Bash heredoc\/tmp command blocked/i
      );
    });
  });

  test('generic bash artifact write guard blocks even outside agent-scoped sessions', () => {
    withTempGuardrailState(() => {
      const result = checkBashArtifactWriteSafety('Bash', {
        command:
          "cat > /c/dev/projects/agent-studio/.claude/context/reports/code-review-2026-02-15.md << 'EOF'\ntext\nEOF",
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /Use Write\/Edit tools/i);
    });
  });

  test('generic bash artifact write guard blocks relative .claude context writes', () => {
    withTempGuardrailState(() => {
      const result = checkBashArtifactWriteSafety('Bash', {
        command: "cat > .claude/context/reports/test-bash-write-guard.md << 'EOF'\ntext\nEOF",
      });
      assert.equal(result.action, 'block');
      assert.match(
        result.message,
        /Bash redirection\/heredoc|Windows-incompatible Bash heredoc\/tmp command blocked/i
      );
    });
  });

  test('generic bash artifact write guard blocks Windows-incompatible heredoc/tmp usage', () => {
    withTempGuardrailState(() => {
      const result = checkBashArtifactWriteSafety('Bash', {
        command:
          "cat > /tmp/research-synthesis.md << 'EOF'\nhello\nEOF\ncat /tmp/research-synthesis.md",
      });
      if (process.platform === 'win32') {
        assert.equal(result.action, 'block');
        assert.match(result.message, /Windows-incompatible Bash heredoc\/tmp command blocked/i);
      } else {
        assert.equal(result.action, 'allow');
      }
    });
  });

  test('generic bash artifact write guard blocks windows /c drive cd prefix pattern', () => {
    withTempGuardrailState(() => {
      const result = checkBashArtifactWriteSafety('Bash', {
        command:
          'cd /c/dev/projects/agent-studio && node --test tests/lib/utils/safe-json-bounded-set.test.cjs',
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /ROUTER-FIRST PROTOCOL VIOLATION/i);
      assert.match(result.message, /avoid `cd \/c\/\.\.\.` style prefixes/i);
    });
  });

  test('windows bash guard still blocks /c drive prefix when artifact guard is off', () => {
    withTempGuardrailState(() => {
      process.env.AGENT_BASH_ARTIFACT_WRITE_GUARD = 'off';
      process.env.AGENT_WINDOWS_BASH_GUARD = 'block';
      const result = checkBashArtifactWriteSafety('Bash', {
        command: 'cd /c/dev/projects/agent-studio && pnpm lint:fix',
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /ROUTER-FIRST PROTOCOL VIOLATION/i);
      assert.match(result.message, /Windows-incompatible Bash heredoc\/tmp command blocked/i);
    });
  });

  test('blocks /c style path usage even when not used via cd prefix', () => {
    withTempGuardrailState(() => {
      process.env.AGENT_BASH_ARTIFACT_WRITE_GUARD = 'off';
      process.env.AGENT_WINDOWS_BASH_GUARD = 'block';
      const result = checkBashArtifactWriteSafety('Bash', {
        command: 'node .claude/tools/analyze.cjs --root /c/dev/projects/agent-studio --format json',
      });
      assert.equal(result.action, 'block');
      assert.match(result.message, /ROUTER-FIRST PROTOCOL VIOLATION/i);
    });
  });
});
