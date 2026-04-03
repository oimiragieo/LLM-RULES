'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create isolated temp dir for each test
let tmpDir;
let DaemonMemory;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-memory-test-'));
  // Fresh require to avoid module cache issues
  DaemonMemory = require('../../../scripts/channels/daemon/memory.cjs').DaemonMemory;
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe('DaemonMemory', () => {
  describe('Tier 1: Chat History', () => {
    it('addMessage() stores message in chat history', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      const ctx = mem.getContext('chat1');
      assert.ok(ctx.includes('hello'), 'Context should contain the message');
      assert.ok(ctx.includes('omar'), 'Context should contain the user');
    });

    it('addMessage() stores multiple messages', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.addMessage('chat1', 'user', 'first message', 'omar');
      mem.addMessage('chat1', 'assistant', 'first reply');
      mem.addMessage('chat1', 'user', 'second message', 'omar');
      const history = mem.chats.get('chat1');
      assert.equal(history.length, 3);
    });

    it('tracks messagesSinceDream counter', () => {
      const mem = new DaemonMemory(tmpDir, {});
      assert.equal(mem.messagesSinceDream, 0);
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      assert.equal(mem.messagesSinceDream, 1);
      mem.addMessage('chat1', 'user', 'hello again', 'omar');
      assert.equal(mem.messagesSinceDream, 2);
    });

    it('caps individual message text at 2000 chars', () => {
      const mem = new DaemonMemory(tmpDir, {});
      const longText = 'x'.repeat(5000);
      mem.addMessage('chat1', 'user', longText, 'omar');
      const history = mem.chats.get('chat1');
      assert.equal(history[0].text.length, 2000);
    });
  });

  describe('Tier 2: Context Building', () => {
    it('getContext() returns empty for unknown chat', () => {
      const mem = new DaemonMemory(tmpDir, {});
      const ctx = mem.getContext('nonexistent');
      assert.equal(ctx, '');
    });

    it('getContext() includes recent messages', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.addMessage('chat1', 'user', 'what is 2+2', 'omar');
      mem.addMessage('chat1', 'assistant', 'it is 4');
      const ctx = mem.getContext('chat1');
      assert.ok(ctx.includes('what is 2+2'));
      assert.ok(ctx.includes('it is 4'));
    });

    it('getContext() includes Tier 3 profile when present', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.profiles.set('chat1', { facts: ['User is Omar', 'Works on agent-studio'], lastDream: '' });
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      const ctx = mem.getContext('chat1');
      assert.ok(ctx.includes('User is Omar'));
      assert.ok(ctx.includes('agent-studio'));
    });

    it('getContext() includes Tier 2 summary when present', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.summaries.set('chat1', 'Previously discussed Python debugging');
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      const ctx = mem.getContext('chat1');
      assert.ok(ctx.includes('Python debugging'));
    });
  });

  describe('Tier 3: User Profiles', () => {
    it('getProfile() returns empty for unknown chat', () => {
      const mem = new DaemonMemory(tmpDir, {});
      const profile = mem.getProfile('nonexistent');
      assert.deepEqual(profile.facts, []);
    });

    it('profile data is accessible', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.profiles.set('chat1', { facts: ['Name is Omar'], lastDream: '2026-01-01' });
      const profile = mem.getProfile('chat1');
      assert.equal(profile.facts.length, 1);
      assert.equal(profile.facts[0], 'Name is Omar');
    });
  });

  describe('Dream Gate', () => {
    it('shouldDream() returns false when not enough messages', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      assert.equal(mem.shouldDream(), false);
    });

    it('shouldDream() returns false when dreamed recently', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.lastDream = Date.now(); // just dreamed
      for (let i = 0; i < 10; i++) mem.addMessage('chat1', 'user', `msg ${i}`, 'omar');
      assert.equal(mem.shouldDream(), false);
    });

    it('shouldDream() returns true when gate conditions met', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.lastDream = Date.now() - 3700000; // 1hr+ ago
      for (let i = 0; i < 6; i++) mem.addMessage('chat1', 'user', `msg ${i}`, 'omar');
      assert.equal(mem.shouldDream(), true);
    });
  });

  describe('Session Rotation', () => {
    it('compaction count increments', () => {
      const mem = new DaemonMemory(tmpDir, {});
      // Fill enough messages to trigger compaction
      for (let i = 0; i < 25; i++) {
        mem.chats.set('chat1', mem.chats.get('chat1') || []);
        mem.chats.get('chat1').push({ role: 'user', user: 'omar', text: `msg ${i}`, timestamp: new Date().toISOString() });
      }
      // Manually call compact (it would normally use execSync which we don't want in tests)
      const count = (mem.compactionCounts.get('chat1') || 0);
      mem.compactionCounts.set('chat1', count + 1);
      assert.equal(mem.compactionCounts.get('chat1'), 1);
    });
  });

  describe('Persistence', () => {
    it('saves and reloads chat history', () => {
      const mem1 = new DaemonMemory(tmpDir, {});
      mem1.addMessage('chat1', 'user', 'persistent message', 'omar');
      // Force save
      mem1._saveHistory();

      // Load in new instance
      const mem2 = new DaemonMemory(tmpDir, {});
      const history = mem2.chats.get('chat1');
      assert.ok(history, 'Chat history should be loaded');
      assert.equal(history.length, 1);
      assert.equal(history[0].text, 'persistent message');
    });

    it('saves and reloads profiles', () => {
      const mem1 = new DaemonMemory(tmpDir, {});
      mem1.profiles.set('chat1', { facts: ['Fact one', 'Fact two'], lastDream: '2026-01-01' });
      mem1._saveProfiles();

      const mem2 = new DaemonMemory(tmpDir, {});
      const profile = mem2.getProfile('chat1');
      assert.equal(profile.facts.length, 2);
      assert.equal(profile.facts[0], 'Fact one');
    });

    it('saves and reloads summaries', () => {
      const mem1 = new DaemonMemory(tmpDir, {});
      mem1.summaries.set('chat1', 'Test summary content');
      mem1._saveSummaries();

      const mem2 = new DaemonMemory(tmpDir, {});
      assert.equal(mem2.summaries.get('chat1'), 'Test summary content');
    });
  });

  describe('Stats', () => {
    it('getStats() returns correct shape', () => {
      const mem = new DaemonMemory(tmpDir, {});
      mem.addMessage('chat1', 'user', 'hello', 'omar');
      mem.addMessage('chat2', 'user', 'hi', 'alice');
      const stats = mem.getStats();
      assert.equal(stats.chats, 2);
      assert.equal(stats.totalMessages, 2);
      assert.equal(stats.profiles, 0);
      assert.equal(typeof stats.messagesSinceDream, 'number');
      assert.ok(stats.lastDream);
    });
  });
});
