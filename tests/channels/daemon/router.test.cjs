'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Router } = require('../../../scripts/channels/daemon/router.cjs');

describe('Router', () => {
  describe('resolve()', () => {
    it('matches exact event type', () => {
      const router = new Router([
        { event: 'telegram.message', handler: 'claude', sink: 'telegram' },
      ]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      assert.equal(routes.length, 1);
      assert.equal(routes[0].handler, 'claude');
      assert.equal(routes[0].sink, 'telegram');
    });

    it('matches glob pattern (telegram.*)', () => {
      const router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      assert.equal(routes.length, 1);
      assert.equal(routes[0].handler, 'claude');
    });

    it('does not match wrong glob prefix', () => {
      const router = new Router([{ event: 'discord.*', handler: 'claude', sink: 'discord' }]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      // Should fall back to default route
      assert.equal(routes.length, 1);
      assert.equal(routes[0].sink, 'telegram'); // default: same source
    });

    it('matches wildcard (*) pattern', () => {
      const router = new Router([{ event: '*', handler: 'echo', sink: 'telegram' }]);
      const routes = router.resolve({ type: 'anything.here', source: 'telegram', data: {} });
      assert.equal(routes.length, 1);
      assert.equal(routes[0].handler, 'echo');
    });

    it('applies filter correctly', () => {
      const router = new Router([
        { event: 'telegram.*', handler: 'claude', sink: 'telegram', filter: { user: 'omar' } },
      ]);
      // Matching filter
      const matched = router.resolve({
        type: 'telegram.message',
        source: 'telegram',
        data: { user: 'omar' },
      });
      assert.equal(matched.length, 1);
      assert.equal(matched[0].handler, 'claude');

      // Non-matching filter — falls to default
      const unmatched = router.resolve({
        type: 'telegram.message',
        source: 'telegram',
        data: { user: 'other' },
      });
      assert.equal(unmatched.length, 1);
      assert.equal(unmatched[0].event, '*'); // default route
    });

    it('returns default route when no match', () => {
      const router = new Router([{ event: 'discord.message', handler: 'claude', sink: 'discord' }]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      assert.equal(routes.length, 1);
      assert.equal(routes[0].handler, 'claude');
      assert.equal(routes[0].sink, 'telegram'); // defaults to event source
    });

    it('returns multiple routes when multiple match', () => {
      const router = new Router([
        { event: 'telegram.*', handler: 'claude', sink: 'telegram' },
        { event: 'telegram.message', handler: 'echo', sink: 'telegram' },
      ]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      assert.equal(routes.length, 2);
      assert.equal(routes[0].handler, 'claude');
      assert.equal(routes[1].handler, 'echo');
    });

    it('works with empty routes array', () => {
      const router = new Router([]);
      const routes = router.resolve({ type: 'telegram.message', source: 'telegram', data: {} });
      assert.equal(routes.length, 1); // default
    });
  });
});
