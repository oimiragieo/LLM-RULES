'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isProtectedDaemonRoute,
  isAuthorizedDaemonRequest,
} = require('../../../scripts/channels/daemon/http-auth.cjs');

describe('channel daemon HTTP auth', () => {
  it('protects state-changing daemon routes', () => {
    for (const pathname of ['/event', '/api/event', '/send', '/dream', '/webhook', '/stop']) {
      assert.equal(isProtectedDaemonRoute('POST', pathname), true, pathname);
    }
  });

  it('leaves read-only health and status routes public', () => {
    assert.equal(isProtectedDaemonRoute('GET', '/health'), false);
    assert.equal(isProtectedDaemonRoute('GET', '/status'), false);
  });

  it('rejects mutating requests when no daemon API token is configured', () => {
    const req = { headers: { authorization: 'Bearer anything' } };
    assert.equal(
      isAuthorizedDaemonRequest(req, { method: 'POST', pathname: '/event', token: '' }),
      false
    );
  });

  it('requires an exact bearer token match for protected routes', () => {
    assert.equal(
      isAuthorizedDaemonRequest(
        { headers: { authorization: 'Bearer secret-token' } },
        { method: 'POST', pathname: '/event', token: 'secret-token' }
      ),
      true
    );
    assert.equal(
      isAuthorizedDaemonRequest(
        { headers: { authorization: 'Bearer wrong' } },
        { method: 'POST', pathname: '/event', token: 'secret-token' }
      ),
      false
    );
  });
});
