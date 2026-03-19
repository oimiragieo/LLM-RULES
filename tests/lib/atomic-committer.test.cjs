'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AtomicCommitter,
  buildCommitMessage,
  validateCommitScope,
} = require('../../.claude/lib/git/atomic-committer.cjs');

// ─── buildCommitMessage ─────────────────────────────────────────────────────

describe('buildCommitMessage', () => {
  it('formats conventional commit', () => {
    const msg = buildCommitMessage({
      type: 'feat',
      subject: 'add user authentication',
    });
    assert.equal(msg, 'feat: add user authentication');
  });

  it('includes scope', () => {
    const msg = buildCommitMessage({
      type: 'fix',
      scope: 'auth',
      subject: 'handle expired tokens',
    });
    assert.equal(msg, 'fix(auth): handle expired tokens');
  });

  it('appends body', () => {
    const msg = buildCommitMessage({
      type: 'refactor',
      subject: 'simplify routing',
      body: 'Extract common logic into shared module.',
    });
    assert.ok(msg.includes('refactor: simplify routing'));
    assert.ok(msg.includes('Extract common logic'));
  });

  it('appends co-author', () => {
    const msg = buildCommitMessage({
      type: 'feat',
      subject: 'add feature',
      coAuthor: 'Claude Opus 4.6 <noreply@anthropic.com>',
    });
    assert.ok(msg.includes('Co-Authored-By: Claude Opus 4.6'));
  });

  it('appends task ID footer', () => {
    const msg = buildCommitMessage({
      type: 'feat',
      subject: 'add feature',
      taskId: 'task-42',
    });
    assert.ok(msg.includes('Task: task-42'));
  });

  it('throws on missing type', () => {
    assert.throws(() => buildCommitMessage({ subject: 'test' }), /type/i);
  });

  it('throws on missing subject', () => {
    assert.throws(() => buildCommitMessage({ type: 'feat' }), /subject/i);
  });
});

// ─── validateCommitScope ────────────────────────────────────────────────────

describe('validateCommitScope', () => {
  it('valid when all files belong to task', () => {
    const result = validateCommitScope({
      taskFiles: ['src/auth.js', 'src/login.js'],
      stagedFiles: ['src/auth.js', 'src/login.js'],
    });
    assert.equal(result.valid, true);
    assert.equal(result.extraFiles.length, 0);
  });

  it('warns on extra staged files', () => {
    const result = validateCommitScope({
      taskFiles: ['src/auth.js'],
      stagedFiles: ['src/auth.js', 'src/unrelated.js'],
    });
    assert.equal(result.valid, false);
    assert.deepEqual(result.extraFiles, ['src/unrelated.js']);
  });

  it('reports missing task files', () => {
    const result = validateCommitScope({
      taskFiles: ['src/auth.js', 'src/login.js'],
      stagedFiles: ['src/auth.js'],
    });
    assert.deepEqual(result.missingFiles, ['src/login.js']);
  });

  it('handles empty inputs', () => {
    const result = validateCommitScope({ taskFiles: [], stagedFiles: [] });
    assert.equal(result.valid, true);
  });

  it('normalizes Windows paths', () => {
    const result = validateCommitScope({
      taskFiles: ['src/auth.js'],
      stagedFiles: ['src\\auth.js'],
    });
    assert.equal(result.valid, true);
  });
});

// ─── AtomicCommitter ────────────────────────────────────────────────────────

describe('AtomicCommitter', () => {
  it('creates with task context', () => {
    const ac = new AtomicCommitter({
      taskId: 'task-5',
      agentId: 'developer',
      description: 'Implement auth',
    });
    assert.equal(ac.taskId, 'task-5');
    assert.equal(ac.agentId, 'developer');
  });

  it('tracks files modified', () => {
    const ac = new AtomicCommitter({ taskId: 't', agentId: 'a', description: 'd' });
    ac.trackFile('src/auth.js');
    ac.trackFile('src/login.js');
    ac.trackFile('src/auth.js'); // duplicate
    assert.equal(ac.getTrackedFiles().length, 2);
  });

  it('generates commit message from task context', () => {
    const ac = new AtomicCommitter({
      taskId: 'task-5',
      agentId: 'developer',
      description: 'Implement JWT auth',
      commitType: 'feat',
    });
    const msg = ac.generateCommitMessage();
    assert.ok(msg.includes('feat:'));
    assert.ok(msg.includes('JWT auth'));
    assert.ok(msg.includes('Task: task-5'));
  });

  it('validates scope before commit', () => {
    const ac = new AtomicCommitter({ taskId: 't', agentId: 'a', description: 'd' });
    ac.trackFile('src/auth.js');
    const result = ac.validateScope(['src/auth.js']);
    assert.equal(result.valid, true);
  });

  it('detects scope violation', () => {
    const ac = new AtomicCommitter({ taskId: 't', agentId: 'a', description: 'd' });
    ac.trackFile('src/auth.js');
    const result = ac.validateScope(['src/auth.js', 'src/extra.js']);
    assert.equal(result.valid, false);
  });

  it('getCommitPlan returns structured plan', () => {
    const ac = new AtomicCommitter({
      taskId: 'task-1',
      agentId: 'developer',
      description: 'Add login',
      commitType: 'feat',
    });
    ac.trackFile('src/login.js');
    const plan = ac.getCommitPlan();
    assert.equal(plan.taskId, 'task-1');
    assert.ok(plan.message.includes('feat:'));
    assert.deepEqual(plan.files, ['src/login.js']);
  });
});
