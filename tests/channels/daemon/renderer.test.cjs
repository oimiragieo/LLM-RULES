'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeRenderer } = require('../../../scripts/channels/daemon/renderer.cjs');

describe('ClaudeRenderer', () => {
  describe('_selectModel()', () => {
    it('uses configured model for short greetings (not haiku)', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel('hello'), 'sonnet');
      assert.equal(r._selectModel('hi'), 'sonnet');
      assert.equal(r._selectModel('hey'), 'sonnet');
      assert.equal(r._selectModel('thanks'), 'sonnet');
    });

    it('uses configured model for very short messages', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel('yes'), 'sonnet');
      assert.equal(r._selectModel('ok sounds good'), 'sonnet');
      assert.equal(r._selectModel('👍'), 'sonnet');
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

    it('uses configured model for empty/null text', () => {
      const r = new ClaudeRenderer({ model: 'sonnet' });
      assert.equal(r._selectModel(''), 'sonnet');
      assert.equal(r._selectModel(null), 'sonnet');
      assert.equal(r._selectModel(undefined), 'sonnet');
    });
  });
});
