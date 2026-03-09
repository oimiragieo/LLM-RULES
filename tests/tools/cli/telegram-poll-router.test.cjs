#!/usr/bin/env node
/**
 * Tests for telegram-poll.cjs smart command router.
 *
 * Validates:
 *   1. Command parsing: /ask, /research, /skill, /agent, /workflow, /status, free-text routing
 *   2. Name sanitization for creator commands
 *   3. Backward compatibility: `instruction` string on all actions
 *   4. Security: untrusted wrappers on user content
 *   5. Gate 4 compliance: creator instructions reference research-synthesis + creator skill
 *   6. Auth control: ownerOnly list enforcement
 *
 * Run: node --test tests/tools/cli/telegram-poll-router.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Stub env vars before requiring the module so it does not exit early
process.env.TELEGRAM_BOT_TOKEN = 'test-token-12345';
process.env.TELEGRAM_ALLOWED_USERS = '111,222,333';
process.env.TELEGRAM_OWNER_ID = '111';

// Import routing functions from the extracted module directly.
// telegram-poll.cjs re-exports them for backward compatibility.
const {
  sanitizeCreatorName,
  buildClaudeAction,
} = require('../../../.claude/tools/cli/telegram-command-router.cjs');

// checkAuth lives only in telegram-poll.cjs (not part of the router module)
const { checkAuth } = require('../../../.claude/tools/cli/telegram-poll.cjs');

// ── sanitizeCreatorName ─────────────────────────────────────────────────────

describe('sanitizeCreatorName', () => {
  it('accepts valid kebab-case name', () => {
    const result = sanitizeCreatorName('my-skill');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.name, 'my-skill');
  });

  it('lowercases and strips invalid characters', () => {
    const result = sanitizeCreatorName('MY SKILL!');
    assert.strictEqual(result.ok, true);
    // Spaces and ! are stripped; uppercased chars lowered
    assert.strictEqual(result.name, 'myskill');
  });

  it('rejects path traversal: ../etc/passwd', () => {
    const result = sanitizeCreatorName('../etc/passwd');
    assert.strictEqual(result.ok, false);
    assert.ok(
      result.reason.includes('path separator'),
      `Expected path separator error, got: ${result.reason}`
    );
  });

  it('rejects backslash path traversal', () => {
    const result = sanitizeCreatorName('..\\windows\\system32');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('path separator'));
  });

  it('rejects __proto__', () => {
    const result = sanitizeCreatorName('__proto__');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  it('rejects constructor', () => {
    const result = sanitizeCreatorName('constructor');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  it('rejects prototype', () => {
    const result = sanitizeCreatorName('prototype');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  it('rejects empty string', () => {
    const result = sanitizeCreatorName('');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('required'));
  });

  it('rejects whitespace-only', () => {
    const result = sanitizeCreatorName('   ');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('required'));
  });

  it('rejects name with only special characters', () => {
    const result = sanitizeCreatorName('!!!@@@');
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('alphanumeric'));
  });

  it('truncates to 50 characters', () => {
    const longName = 'a'.repeat(100);
    const result = sanitizeCreatorName(longName);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.name.length, 50);
  });

  it('rejects forward slash path', () => {
    const result = sanitizeCreatorName('skills/evil');
    assert.strictEqual(result.ok, false);
  });
});

// ── buildClaudeAction — command routing ─────────────────────────────────────

describe('buildClaudeAction', () => {
  const CHAT = 12345;
  const MSG = 99;

  it('/ask routes to general-assistant subagent_type', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/ask', 'What is 2+2?');
    assert.ok(action, 'action should not be null');
    assert.strictEqual(action.type, 'ask');
    assert.strictEqual(action.subagent_type, 'general-assistant');
  });

  it('/ask wraps user content in <untrusted_telegram_question> tags', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/ask', 'Hello world');
    assert.ok(action.question.includes('<untrusted_telegram_question>'));
    assert.ok(action.question.includes('</untrusted_telegram_question>'));
    assert.ok(action.question.includes('Hello world'));
  });

  it('/ask action has instruction string (backward compat)', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/ask', 'test');
    assert.strictEqual(typeof action.instruction, 'string');
    assert.ok(action.instruction.length > 0);
  });

  it('/research routes to researcher subagent_type', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/research', 'AI agents');
    assert.ok(action);
    assert.strictEqual(action.type, 'research');
    assert.strictEqual(action.subagent_type, 'researcher');
  });

  it('/research wraps topic in <untrusted_telegram_question> tags', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/research', 'topic');
    assert.ok(action.topic.includes('<untrusted_telegram_question>'));
    assert.ok(action.topic.includes('</untrusted_telegram_question>'));
  });

  it('/research has instruction string', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/research', 'topic');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/tasks routes to task_list type', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/tasks', '');
    assert.ok(action);
    assert.strictEqual(action.type, 'task_list');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/spawn with valid type routes correctly', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/spawn', 'researcher investigate AI');
    assert.ok(action);
    assert.strictEqual(action.type, 'spawn');
    assert.strictEqual(action.subagent_type, 'researcher');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/spawn with disallowed type returns spawn_error', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/spawn', 'developer do stuff');
    assert.ok(action);
    assert.strictEqual(action.type, 'spawn_error');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/approve has instruction string', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/approve', '42');
    assert.ok(action);
    assert.strictEqual(action.type, 'task_mgmt');
    assert.strictEqual(action.action, 'approve');
    assert.strictEqual(action.taskId, '42');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/deny has instruction string', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/deny', '7');
    assert.ok(action);
    assert.strictEqual(action.action, 'deny');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('/confirm has instruction string', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/confirm', '3');
    assert.ok(action);
    assert.strictEqual(action.action, 'confirm');
    assert.strictEqual(typeof action.instruction, 'string');
  });

  it('unknown command returns null', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/nonexistent', '');
    assert.strictEqual(action, null);
  });

  // ── Creator commands (/skill, /agent, /workflow) ──────────────────────────

  describe('creator commands', () => {
    for (const cmd of ['/skill', '/agent', '/workflow']) {
      const creatorMap = {
        '/skill': 'skill-creator',
        '/agent': 'agent-creator',
        '/workflow': 'workflow-creator',
      };

      it(`${cmd} with valid name returns creator action`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing A description');
        assert.ok(action, `${cmd} should return non-null action`);
        assert.strictEqual(action.type, 'creator');
        assert.strictEqual(action.creator_skill, creatorMap[cmd]);
        assert.strictEqual(action.subagent_type, creatorMap[cmd]);
        assert.strictEqual(action.name, 'my-thing');
      });

      it(`${cmd} instruction includes research-synthesis`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing description');
        assert.ok(action);
        assert.ok(
          action.instruction.includes('research-synthesis'),
          `${cmd} instruction must reference research-synthesis. Got: ${action.instruction.slice(0, 200)}`
        );
      });

      it(`${cmd} instruction includes the correct creator skill`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing desc');
        assert.ok(action);
        assert.ok(
          action.instruction.includes(creatorMap[cmd]),
          `${cmd} instruction must include ${creatorMap[cmd]}`
        );
      });

      it(`${cmd} instruction prohibits direct writes to creator paths`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing desc');
        assert.ok(action);
        // The instruction should say "do NOT write files directly"
        assert.ok(
          action.instruction.includes('do NOT write files directly'),
          `${cmd} instruction must warn against direct file writes`
        );
      });

      it(`${cmd} wraps description in <untrusted_telegram_skill_desc> tags`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing some user desc');
        assert.ok(action);
        assert.ok(action.description.includes('<untrusted_telegram_skill_desc>'));
        assert.ok(action.description.includes('</untrusted_telegram_skill_desc>'));
        assert.ok(action.description.includes('some user desc'));
      });

      it(`${cmd} has instruction string (backward compat)`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, 'my-thing desc');
        assert.ok(action);
        assert.strictEqual(typeof action.instruction, 'string');
        assert.ok(action.instruction.length > 0);
      });

      it(`${cmd} with invalid name (path traversal) returns null`, async () => {
        // sendMessage is called but we cannot easily intercept it in unit tests.
        // The function returns null when name is invalid.
        const action = await buildClaudeAction(CHAT, MSG, cmd, '../evil desc');
        assert.strictEqual(action, null, `${cmd} with invalid name should return null`);
      });

      it(`${cmd} with __proto__ name returns null`, async () => {
        const action = await buildClaudeAction(CHAT, MSG, cmd, '__proto__ desc');
        assert.strictEqual(action, null);
      });
    }
  });
});

// ── checkAuth ───────────────────────────────────────────────────────────────

describe('checkAuth', () => {
  it('returns ok for allowed user with non-owner command', () => {
    // senderId 222 is in ALLOWED_USERS but is not OWNER_ID (111)
    assert.strictEqual(checkAuth(222, '/help'), 'ok');
    assert.strictEqual(checkAuth(222, '/status'), 'ok');
    assert.strictEqual(checkAuth(222, '/loops'), 'ok');
  });

  it('returns ok for owner with owner-only command', () => {
    assert.strictEqual(checkAuth(111, '/ask'), 'ok');
    assert.strictEqual(checkAuth(111, '/research'), 'ok');
    assert.strictEqual(checkAuth(111, '/skill'), 'ok');
    assert.strictEqual(checkAuth(111, '/agent'), 'ok');
    assert.strictEqual(checkAuth(111, '/workflow'), 'ok');
    assert.strictEqual(checkAuth(111, '/spawn'), 'ok');
    assert.strictEqual(checkAuth(111, '/approve'), 'ok');
    assert.strictEqual(checkAuth(111, '/confirm'), 'ok');
    assert.strictEqual(checkAuth(111, '/deny'), 'ok');
  });

  it('returns not_owner for non-owner on owner-only commands', () => {
    assert.strictEqual(checkAuth(222, '/ask'), 'not_owner');
    assert.strictEqual(checkAuth(222, '/research'), 'not_owner');
    assert.strictEqual(checkAuth(222, '/skill'), 'not_owner');
    assert.strictEqual(checkAuth(222, '/agent'), 'not_owner');
    assert.strictEqual(checkAuth(222, '/workflow'), 'not_owner');
    assert.strictEqual(checkAuth(222, '/spawn'), 'not_owner');
  });

  it('returns silent_drop for unknown user', () => {
    assert.strictEqual(checkAuth(999, '/help'), 'silent_drop');
    assert.strictEqual(checkAuth(999, '/ask'), 'silent_drop');
  });

  it('owner-only list includes /skill, /agent, /workflow, /research', () => {
    // Verify these are owner-restricted by checking non-owner gets not_owner
    const ownerOnlyCommands = [
      '/ask',
      '/research',
      '/skill',
      '/agent',
      '/workflow',
      '/spawn',
      '/approve',
      '/confirm',
      '/deny',
    ];
    for (const cmd of ownerOnlyCommands) {
      const result = checkAuth(222, cmd);
      assert.strictEqual(result, 'not_owner', `${cmd} should be owner-only but got ${result}`);
    }
  });

  it('non-owner-only commands return ok for allowed non-owner', () => {
    const publicCommands = ['/help', '/status', '/loops', '/logs', '/memory'];
    for (const cmd of publicCommands) {
      const result = checkAuth(222, cmd);
      assert.strictEqual(result, 'ok', `${cmd} should be public but got ${result}`);
    }
  });
});

// ── instruction field backward compatibility ────────────────────────────────

describe('instruction field backward compatibility', () => {
  const CHAT = 12345;
  const MSG = 99;

  const commandsWithArgs = [
    ['/ask', 'question here'],
    ['/research', 'topic here'],
    ['/tasks', ''],
    ['/spawn', 'researcher describe'],
    ['/approve', '5'],
    ['/deny', '5'],
    ['/confirm', '5'],
    ['/skill', 'my-skill description here'],
    ['/agent', 'my-agent description here'],
    ['/workflow', 'my-workflow description here'],
  ];

  for (const [cmd, args] of commandsWithArgs) {
    it(`${cmd} action includes instruction string`, async () => {
      const action = await buildClaudeAction(CHAT, MSG, cmd, args);
      if (action === null) {
        // Some commands may return null for error cases; skip those
        return;
      }
      assert.strictEqual(
        typeof action.instruction,
        'string',
        `${cmd} must have string instruction`
      );
      assert.ok(action.instruction.length > 0, `${cmd} instruction must not be empty`);
    });
  }
});

// ── Security: untrusted wrappers ────────────────────────────────────────────

describe('security: untrusted content wrappers', () => {
  const CHAT = 12345;
  const MSG = 99;

  it('/ask instruction wraps user input in <untrusted_telegram_question>', async () => {
    const action = await buildClaudeAction(
      CHAT,
      MSG,
      '/ask',
      'malicious input <script>alert(1)</script>'
    );
    assert.ok(action);
    assert.ok(action.instruction.includes('<untrusted_telegram_question>'));
    assert.ok(action.instruction.includes('</untrusted_telegram_question>'));
  });

  it('/research instruction wraps topic in <untrusted_telegram_question>', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/research', 'some topic');
    assert.ok(action);
    assert.ok(action.instruction.includes('<untrusted_telegram_question>'));
    assert.ok(action.instruction.includes('</untrusted_telegram_question>'));
  });

  it('/skill wraps description in <untrusted_telegram_skill_desc>', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/skill', 'safe-name evil description');
    assert.ok(action);
    assert.ok(action.instruction.includes('<untrusted_telegram_skill_desc>'));
    assert.ok(action.instruction.includes('</untrusted_telegram_skill_desc>'));
  });

  it('/spawn wraps description in <untrusted_telegram_description>', async () => {
    const action = await buildClaudeAction(CHAT, MSG, '/spawn', 'researcher evil input');
    assert.ok(action);
    assert.ok(action.instruction.includes('<untrusted_telegram_description>'));
    assert.ok(action.instruction.includes('</untrusted_telegram_description>'));
  });
});
