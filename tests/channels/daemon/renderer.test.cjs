'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeRenderer } = require('../../../scripts/channels/daemon/renderer.cjs');

describe('ClaudeRenderer', () => {
  describe('_selectModel()', () => {
    it('selects haiku for short greetings', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel('hello'), 'haiku');
      assert.equal(r._selectModel('hi'), 'haiku');
      assert.equal(r._selectModel('hey'), 'haiku');
      assert.equal(r._selectModel('thanks'), 'haiku');
    });

    it('selects haiku for very short messages (<30 chars)', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel('yes'), 'haiku');
      assert.equal(r._selectModel('ok sounds good'), 'haiku');
      assert.equal(r._selectModel('👍'), 'haiku');
    });

    it('selects sonnet for regular conversation', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel('explain how the event loop works in Node.js'), 'sonnet');
      assert.equal(
        r._selectModel('what is the best approach for handling state management in React'),
        'sonnet'
      );
    });

    it('uses config model as default for medium messages', () => {
      const r = new ClaudeRenderer({ model: 'opus' });
      assert.equal(
        r._selectModel('explain the reactor pattern in distributed systems with examples'),
        'opus'
      );
    });

    it('selects haiku for empty/null text', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel(''), 'haiku');
      assert.equal(r._selectModel(null), 'haiku');
      assert.equal(r._selectModel(undefined), 'haiku');
    });
  });
});
