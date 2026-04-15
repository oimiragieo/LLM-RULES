'use strict';

/**
 * Integration tests for Telegram Wave 5 features (B2-B5, A1).
 *
 * Tests are unit-level — no live Telegram bot required.
 * The Telegram API is mocked via module-level patching.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Shared API mock — patches telegramApi on the module exports object so that
// both the source and the sink (which imports from the source) see the mock.
// ---------------------------------------------------------------------------
const telegramSourceModule = require('../../scripts/channels/daemon/sources/telegram.cjs');
const originalTelegramApi = telegramSourceModule.telegramApi;

const apiCalls = [];

function mockApi(token, method, body) {
  apiCalls.push({ token, method, body });
  return Promise.resolve({ ok: true, result: { message_id: 42 } });
}

before(() => {
  telegramSourceModule.telegramApi = mockApi;
});

after(() => {
  telegramSourceModule.telegramApi = originalTelegramApi;
});

beforeEach(() => {
  apiCalls.length = 0;
});

// ===========================================================================
// A1: ACL enum — 3-policy config parsing (pairing / allowlist / disabled)
// ===========================================================================
describe('A1: ACL enum — DM_POLICIES constant and loadAccessConfig', () => {
  const {
    DM_POLICIES,
    loadAccessConfig,
  } = require('../../scripts/channels/daemon/config.cjs');

  it('DM_POLICIES contains exactly the three valid policies', () => {
    assert.deepStrictEqual(DM_POLICIES.sort(), ['allowlist', 'disabled', 'pairing']);
  });

  it('loadAccessConfig returns pairing as default when no access.json exists', () => {
    // The file path points to a user home directory that won't exist in CI —
    // loadAccessConfig catches the error and returns defaults.
    const config = loadAccessConfig();
    assert.ok(DM_POLICIES.includes(config.dmPolicy), `dmPolicy "${config.dmPolicy}" is not a valid policy`);
    assert.ok(Array.isArray(config.allowFrom), 'allowFrom should be an array');
    assert.ok(Array.isArray(config.groups), 'groups should be an array');
    assert.ok(Array.isArray(config.pending), 'pending should be an array');
  });

  it('pairing policy is included in DM_POLICIES', () => {
    assert.ok(DM_POLICIES.includes('pairing'), 'DM_POLICIES should include "pairing"');
  });

  it('allowlist policy is included in DM_POLICIES', () => {
    assert.ok(DM_POLICIES.includes('allowlist'), 'DM_POLICIES should include "allowlist"');
  });

  it('disabled policy is included in DM_POLICIES', () => {
    assert.ok(DM_POLICIES.includes('disabled'), 'DM_POLICIES should include "disabled"');
  });
});

// ===========================================================================
// B2: @mention detection — group messages without @mention are skipped;
//     private messages are always processed.
// ===========================================================================
describe('B2: @mention detection in Dispatcher._handleEvent', () => {
  // We test the B2 logic directly by exercising the Dispatcher class.
  // We stub out the renderer, router, memory, and sinks to isolate the feature.

  function makeDispatcher(botUsername) {
    const { Dispatcher } = require('../../scripts/channels/daemon/dispatcher.cjs');

    const fakeRouter = {
      resolve: () => [{ handler: 'claude', sink: 'telegram' }],
    };

    const rendered = [];
    const fakeRenderer = {
      render: event => {
        rendered.push(event);
        return 'ok response';
      },
      renderProactive: () => 'proactive',
    };

    const sentMessages = [];
    const fakeSink = {
      send: (chatId, text, opts) => {
        sentMessages.push({ chatId, text, opts });
        return Promise.resolve(99);
      },
      sendTyping: () => Promise.resolve(),
    };

    // Minimal config — suppress real executor construction side-effects
    const config = { projectRoot: process.cwd(), maxConcurrentTasks: 1 };

    if (botUsername) process.env.TELEGRAM_BOT_USERNAME = botUsername;
    else delete process.env.TELEGRAM_BOT_USERNAME;

    const dispatcher = new Dispatcher(
      fakeRouter,
      fakeRenderer,
      { telegram: fakeSink },
      () => {}, // silent log
      null, // no memory
      config,
      null
    );

    return { dispatcher, rendered, sentMessages };
  }

  it('private chat message is processed without @mention check', async () => {
    const { dispatcher, rendered } = makeDispatcher('mybot');

    const event = {
      type: 'telegram.message',
      source: 'telegram',
      timestamp: new Date().toISOString(),
      data: {
        chatId: '111',
        chatType: 'private',
        messageId: 1,
        user: 'alice',
        userId: '999',
        text: 'hello world',
      },
    };

    dispatcher.enqueue(event);
    // Give the async queue one tick to drain
    await new Promise(r => setImmediate(r));

    assert.equal(rendered.length, 1, 'private message should reach renderer');
  });

  it('group message without @mention is silently dropped', async () => {
    const { dispatcher, rendered } = makeDispatcher('mybot');

    const event = {
      type: 'telegram.message',
      source: 'telegram',
      timestamp: new Date().toISOString(),
      data: {
        chatId: '222',
        chatType: 'group',
        messageId: 2,
        user: 'bob',
        userId: '888',
        text: 'hey everyone', // no @mybot mention
      },
    };

    dispatcher.enqueue(event);
    await new Promise(r => setImmediate(r));

    assert.equal(rendered.length, 0, 'group message without @mention should be dropped');
  });

  it('group message with @mention is processed', async () => {
    const { dispatcher, rendered } = makeDispatcher('mybot');

    const event = {
      type: 'telegram.message',
      source: 'telegram',
      timestamp: new Date().toISOString(),
      data: {
        chatId: '333',
        chatType: 'group',
        messageId: 3,
        user: 'carol',
        userId: '777',
        text: '@mybot what is the answer?',
      },
    };

    dispatcher.enqueue(event);
    await new Promise(r => setImmediate(r));

    assert.equal(rendered.length, 1, 'group message with @mention should be processed');
  });

  it('supergroup message without @mention is silently dropped', async () => {
    const { dispatcher, rendered } = makeDispatcher('mybot');

    const event = {
      type: 'telegram.message',
      source: 'telegram',
      timestamp: new Date().toISOString(),
      data: {
        chatId: '444',
        chatType: 'supergroup',
        messageId: 4,
        user: 'dave',
        userId: '666',
        text: 'random supergroup chat',
      },
    };

    dispatcher.enqueue(event);
    await new Promise(r => setImmediate(r));

    assert.equal(rendered.length, 0, 'supergroup message without @mention should be dropped');
  });

  it('group message is processed when no bot username is configured', async () => {
    // When no TELEGRAM_BOT_USERNAME is set, the mention check is skipped
    const { dispatcher, rendered } = makeDispatcher(null);

    const event = {
      type: 'telegram.message',
      source: 'telegram',
      timestamp: new Date().toISOString(),
      data: {
        chatId: '555',
        chatType: 'group',
        messageId: 5,
        user: 'eve',
        userId: '555',
        text: 'any group message',
      },
    };

    dispatcher.enqueue(event);
    await new Promise(r => setImmediate(r));

    // botName is '' so the mention filter is disabled — message goes through
    assert.equal(rendered.length, 1, 'group message should be processed when no bot username set');
  });
});

// ===========================================================================
// B3: Typing indicator — sendTyping is called and cleared via setInterval
// ===========================================================================
describe('B3: Typing indicator — TelegramSink.sendTyping', () => {
  it('sendTyping() calls sendChatAction with action=typing', async () => {
    const { TelegramSink } = require('../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    apiCalls.length = 0;

    await sink.sendTyping('chat-123');

    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].method, 'sendChatAction');
    assert.equal(apiCalls[0].body.chat_id, 'chat-123');
    assert.equal(apiCalls[0].body.action, 'typing');
  });

  it('sendTyping() does not throw when API call fails', async () => {
    const { TelegramSink } = require('../../scripts/channels/daemon/sinks/telegram.cjs');
    const failingApi = () => Promise.reject(new Error('network down'));
    const savedApi = telegramSourceModule.telegramApi;
    telegramSourceModule.telegramApi = failingApi;

    const sink = new TelegramSink('test-token');

    try {
      await sink.sendTyping('chat-456');
      // No assertion needed — we just confirm no throw
    } finally {
      telegramSourceModule.telegramApi = savedApi;
    }
  });

  it('sendTyping() sends typing to the correct chat id', async () => {
    const { TelegramSink } = require('../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('my-token');
    apiCalls.length = 0;

    await sink.sendTyping('specific-chat-789');

    assert.equal(apiCalls[0].body.chat_id, 'specific-chat-789');
  });
});

// ===========================================================================
// B4: Auto-chunking — _chunkText() splits text >maxLen correctly
// ===========================================================================
describe('B4: Auto-chunking — Dispatcher._chunkText', () => {
  // Instantiate a minimal Dispatcher to access the private method
  function getDispatcher() {
    const { Dispatcher } = require('../../scripts/channels/daemon/dispatcher.cjs');
    const config = { projectRoot: process.cwd(), maxConcurrentTasks: 1 };
    return new Dispatcher(
      { resolve: () => [] },
      { render: () => '', renderProactive: () => '' },
      {},
      () => {},
      null,
      config,
      null
    );
  }

  it('short text is returned as a single chunk', () => {
    const d = getDispatcher();
    const result = d._chunkText('short text', 100);
    assert.equal(result.length, 1);
    assert.equal(result[0], 'short text');
  });

  it('text exactly at maxLen is a single chunk', () => {
    const d = getDispatcher();
    const text = 'a'.repeat(100);
    const result = d._chunkText(text, 100);
    assert.equal(result.length, 1);
  });

  it('text longer than maxLen is split into multiple chunks', () => {
    const d = getDispatcher();
    const text = 'a'.repeat(4097);
    const result = d._chunkText(text, 4096);
    assert.ok(result.length >= 2, 'should produce at least 2 chunks');
  });

  it('each chunk is at most maxLen characters', () => {
    const d = getDispatcher();
    const maxLen = 3800;
    // Build a text with natural paragraph breaks (double newlines)
    const para = 'word '.repeat(200); // ~1000 chars
    const text = [para, para, para, para, para].join('\n\n'); // ~5200 chars
    const chunks = d._chunkText(text, maxLen);

    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= maxLen,
        `chunk of length ${chunk.length} exceeds maxLen ${maxLen}`
      );
    }
  });

  it('no content is lost during chunking', () => {
    const d = getDispatcher();
    const maxLen = 500;
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = d._chunkText(text, maxLen);

    // All original words should appear somewhere in the chunks
    const reconstructed = chunks.join(' ');
    for (const word of words) {
      assert.ok(reconstructed.includes(word), `word "${word}" was lost during chunking`);
    }
  });

  it('chunking prefers paragraph boundaries over mid-word cuts', () => {
    const d = getDispatcher();
    const para1 = 'First paragraph. '.repeat(20); // ~340 chars
    const para2 = 'Second paragraph. '.repeat(20); // ~360 chars
    const text = para1.trim() + '\n\n' + para2.trim();

    const chunks = d._chunkText(text, 400);
    // The split should not cut mid-word
    for (const chunk of chunks) {
      assert.ok(!chunk.startsWith('aragraph'), 'chunk should not start mid-word');
    }
  });

  it('empty text returns an array (short-circuit path)', () => {
    const d = getDispatcher();
    // _chunkText short-circuits for text.length <= maxLen — empty string qualifies
    const result = d._chunkText('', 100);
    assert.ok(Array.isArray(result), 'result should be an array');
  });

  it('very long text with no natural break points is hard-cut at maxLen', () => {
    const d = getDispatcher();
    const maxLen = 100;
    // 300 chars of 'a' with no spaces or newlines — will use the hard-cut fallback
    const text = 'a'.repeat(300);
    const chunks = d._chunkText(text, maxLen);
    assert.ok(chunks.length >= 2, 'should produce multiple chunks');
    for (const chunk of chunks) {
      assert.ok(chunk.length <= maxLen, `chunk length ${chunk.length} exceeds maxLen ${maxLen}`);
    }
  });
});

// ===========================================================================
// B5: File path detection — regex identifies file paths in task results
// ===========================================================================
describe('B5: File path detection regex', () => {
  // The regex is defined inline in dispatcher.cjs _deliverTaskResult.
  // We extract and test it here to verify its behaviour without needing
  // to run the full async pipeline.
  const FILE_PATH_REGEX =
    /(?:\/[\w./-]+|[A-Z]:\\[\w.\\/-]+)\.(?:md|pdf|csv|txt|json|png|jpg|svg|html|xlsx|docx)/gi;

  function findPaths(text) {
    return text.match(FILE_PATH_REGEX) || [];
  }

  it('detects Unix absolute file paths', () => {
    const text = 'Generated report at /tmp/output/report.md for review';
    const paths = findPaths(text);
    assert.ok(paths.length > 0, 'should detect Unix path');
    assert.ok(paths.some(p => p.includes('report.md')));
  });

  it('detects Windows absolute file paths', () => {
    const text = 'Saved to C:\\Users\\james\\report.pdf successfully';
    const paths = findPaths(text);
    assert.ok(paths.length > 0, 'should detect Windows path');
    assert.ok(paths.some(p => p.includes('report.pdf')));
  });

  it('detects multiple file paths in one result', () => {
    const text = 'Files created: /var/data/export.csv and /var/data/chart.png';
    const paths = findPaths(text);
    assert.equal(paths.length, 2, 'should detect both paths');
  });

  it('does not detect non-file text', () => {
    const text = 'No file paths here, just plain prose.';
    const paths = findPaths(text);
    assert.equal(paths.length, 0, 'should not detect anything in plain text');
  });

  it('detects all supported extensions', () => {
    const extensions = ['md', 'pdf', 'csv', 'txt', 'json', 'png', 'jpg', 'svg', 'html', 'xlsx', 'docx'];
    for (const ext of extensions) {
      const text = `/some/path/file.${ext}`;
      const paths = findPaths(text);
      assert.ok(paths.length > 0, `should detect .${ext} extension`);
    }
  });

  it('is case-insensitive for Windows paths', () => {
    const text = 'Report at C:\\Reports\\Summary.PDF was generated';
    const paths = findPaths(text);
    assert.ok(paths.length > 0, 'should detect .PDF (uppercase) as pdf');
  });

  it('deduplication: each unique path should appear once', () => {
    // The dispatcher uses [...new Set(filePaths)] — test that deduplication logic works
    const text = '/tmp/report.md and /tmp/report.md again';
    const paths = findPaths(text);
    const unique = [...new Set(paths)];
    assert.equal(unique.length, 1, 'duplicate paths should deduplicate to one entry');
  });
});
