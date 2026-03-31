#!/usr/bin/env node
/**
 * Tests for flight-recorder payload redaction (VAL-IR-004, VAL-IR-005)
 *
 * Verifies that:
 *  1. redactObject() from utils/redact-secrets.cjs replaces sensitive-keyed
 *     fields and secret-valued fields with '********'.
 *  2. When callers pass a redactObject()-sanitized payload to flight-recorder
 *     record(), the written JSONL contains no original secret values.
 *  3. Recursion up to MAX_DEPTH=5 is enforced — objects beyond depth 5 pass
 *     through unredacted.
 *  4. Prototype-pollution keys (__proto__, constructor, prototype) are stripped.
 *
 * NOTE: record() does NOT perform redaction itself. Redaction is the caller's
 * responsibility, as specified in the feature description.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { redactObject, MAX_DEPTH, REDACTED } = require('../../.claude/lib/utils/redact-secrets.cjs');

const { record, _logBuffer } = require('../../.claude/lib/monitoring/flight-recorder.cjs');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir;
let testLogPath;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-redact-test-'));
  testLogPath = path.join(tmpDir, 'test-redact.jsonl');
});

after(() => {
  if (_logBuffer) {
    _logBuffer.close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    // best-effort cleanup
  }
});

/** Write an event via flight-recorder and synchronously flush, then read it back. */
function recordAndRead(event) {
  if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
  record(event, testLogPath);
  if (_logBuffer) _logBuffer.flushSync();
  const raw = fs.readFileSync(testLogPath, 'utf8').trim();
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// VAL-IR-004: key-name based redaction — sensitive fields are replaced
// ---------------------------------------------------------------------------

describe('redactObject() — key-name based redaction (VAL-IR-004)', () => {
  it('redacts apiKey field while preserving non-secret data field', () => {
    const result = redactObject({ apiKey: 'placeholder-api-key-value', data: 'safe' });
    assert.equal(result.apiKey, REDACTED, 'apiKey must be redacted');
    assert.equal(result.data, 'safe', 'non-secret field must be preserved verbatim');
  });

  it('redacts token field', () => {
    const result = redactObject({ token: 'some-bearer-token', name: 'widget' });
    assert.equal(result.token, REDACTED);
    assert.equal(result.name, 'widget');
  });

  it('redacts password field', () => {
    const result = redactObject({ password: 'hunter2', user: 'admin' });
    assert.equal(result.password, REDACTED);
    assert.equal(result.user, 'admin');
  });

  it('redacts authorization field (case-insensitive key match)', () => {
    const result = redactObject({ Authorization: 'placeholder-auth-value', path: '/api/v1' });
    assert.equal(result.Authorization, REDACTED);
    assert.equal(result.path, '/api/v1');
  });

  it('redacts secret field', () => {
    const result = redactObject({ secret: 'longpassword123', id: 'abc' });
    assert.equal(result.secret, REDACTED);
    assert.equal(result.id, 'abc');
  });

  it('redacts aws_secret_access_key field', () => {
    const result = redactObject({ aws_secret_access_key: 'placeholder-aws-key-value' });
    assert.equal(result.aws_secret_access_key, REDACTED);
  });

  it('redacts github_token field', () => {
    const result = redactObject({ github_token: 'placeholder-github-token', repo: 'myrepo' });
    assert.equal(result.github_token, REDACTED);
    assert.equal(result.repo, 'myrepo');
  });

  it('redacts jwt field', () => {
    const result = redactObject({ jwt: 'placeholder-jwt-test-value', userId: 42 });
    assert.equal(result.jwt, REDACTED);
    assert.equal(result.userId, 42);
  });

  it('redacts connection_string field', () => {
    const result = redactObject({ connection_string: 'placeholder-connstr', host: 'db' });
    assert.equal(result.connection_string, REDACTED);
    assert.equal(result.host, 'db');
  });

  it('preserves non-sensitive fields verbatim (numbers, booleans, strings)', () => {
    const result = redactObject({ count: 42, active: true, label: 'hello' });
    assert.equal(result.count, 42);
    assert.equal(result.active, true);
    assert.equal(result.label, 'hello');
  });

  it('MAX_DEPTH constant equals 5', () => {
    assert.equal(MAX_DEPTH, 5, 'MAX_DEPTH must be 5 per specification');
  });
});

// ---------------------------------------------------------------------------
// VAL-IR-004: Integration — redactObject() result written to JSONL via record()
// ---------------------------------------------------------------------------

describe('redactObject() + record() integration (VAL-IR-004)', () => {
  it('JSONL output has redacted apiKey and preserved data field', () => {
    const payload = redactObject({ apiKey: 'placeholder-api-key-value', data: 'safe' });
    const parsed = recordAndRead({ event: 'test_redact', component: 'test', payload });

    assert.equal(parsed.payload.apiKey, REDACTED, 'apiKey must be ******** in JSONL output');
    assert.equal(parsed.payload.data, 'safe', 'data must be preserved in JSONL output');
  });

  it('original input value does not appear anywhere in the JSONL file after redaction', () => {
    const originalValue = 'unique-input-xYzAbC123';
    const payload = redactObject({ apiKey: originalValue, data: 'safe' });
    record({ event: 'test_no_leak', component: 'test', payload }, testLogPath);
    if (_logBuffer) _logBuffer.flushSync();

    const fileContent = fs.readFileSync(testLogPath, 'utf8');
    assert.ok(
      !fileContent.includes(originalValue),
      'Original input value must not appear in the JSONL file after redaction'
    );
    assert.ok(
      fileContent.includes(REDACTED),
      'Redaction marker ******** must appear in the JSONL file'
    );
  });

  it('record() without redactObject() does NOT redact (caller responsibility)', () => {
    // Demonstrates that record() itself performs no redaction
    if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
    const rawValue = 'raw-unredacted-value-abc';
    record({ event: 'raw_event', component: 'test', apiKey: rawValue }, testLogPath);
    if (_logBuffer) _logBuffer.flushSync();
    const content = fs.readFileSync(testLogPath, 'utf8');
    // The raw value should still be present since we did NOT call redactObject()
    assert.ok(
      content.includes(rawValue),
      'Unredacted secrets ARE written when caller skips redactObject() — record() is fail-open'
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-IR-005: Nested objects and arrays, depth limit, prototype-pollution keys
// ---------------------------------------------------------------------------

describe('redactObject() — nested objects/arrays and depth limit (VAL-IR-005)', () => {
  it('redacts Authorization header in nested config.headers', () => {
    const payload = {
      config: {
        headers: {
          Authorization: 'placeholder-auth-value',
        },
      },
      items: [{ secret: 'placeholder-secret-value' }],
    };
    const result = redactObject(payload);
    assert.equal(
      result.config.headers.Authorization,
      REDACTED,
      'Authorization in nested headers must be redacted'
    );
    assert.equal(result.items[0].secret, REDACTED, 'secret in array element must be redacted');
  });

  it('returns objects at depth >= MAX_DEPTH (5) as-is without redaction', () => {
    // Construct a chain: outer wraps inner MAX_DEPTH+1 times so the leaf sits at depth > MAX_DEPTH
    let inner = { apiKey: 'deeply-nested-placeholder-value' };
    for (let i = 0; i < MAX_DEPTH + 1; i++) {
      inner = { nested: inner };
    }
    // inner is now wrapped MAX_DEPTH+1 times
    const result = redactObject(inner);

    // Navigate exactly MAX_DEPTH levels down to reach the object returned as-is
    let current = result;
    for (let i = 0; i < MAX_DEPTH; i++) {
      current = current.nested;
    }

    // current was returned as-is (depth == MAX_DEPTH), so it still contains the original value
    assert.ok(
      JSON.stringify(current).includes('deeply-nested-placeholder-value'),
      'Value beyond MAX_DEPTH must survive unredacted'
    );
  });

  it('strips __proto__ key from output', () => {
    // Use Object.create(null) so __proto__ becomes a real own property
    const obj = Object.create(null);
    Object.defineProperty(obj, '__proto__', {
      value: { injected: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    obj.safe = 'value';

    const result = redactObject(obj);
    assert.equal(result.safe, 'value');
    assert.ok(
      !Object.keys(result).includes('__proto__'),
      '__proto__ key must be absent from result'
    );
  });

  it('strips constructor key from output', () => {
    const obj = { constructor: 'evil', safe: 'value' };
    const result = redactObject(obj);
    assert.equal(result.safe, 'value');
    assert.ok(
      !Object.keys(result).includes('constructor'),
      'constructor key must be absent from result'
    );
  });

  it('strips prototype key from output', () => {
    const obj = { prototype: 'evil', safe: 'value' };
    const result = redactObject(obj);
    assert.equal(result.safe, 'value');
    assert.ok(
      !Object.keys(result).includes('prototype'),
      'prototype key must be absent from result'
    );
  });

  it('handles null and undefined inputs without throwing', () => {
    assert.equal(redactObject(null), null);
    assert.equal(redactObject(undefined), undefined);
  });

  it('handles empty objects and arrays', () => {
    assert.deepEqual(Object.keys(redactObject({})), []);
    const arrResult = redactObject([]);
    assert.ok(Array.isArray(arrResult));
    assert.equal(arrResult.length, 0);
  });

  it('redacts sensitive leaves in arrays at multiple depths', () => {
    const result = redactObject([
      { apiKey: 'k1', label: 'first' },
      { password: 'pw', label: 'second' },
    ]);
    assert.equal(result[0].apiKey, REDACTED);
    assert.equal(result[0].label, 'first');
    assert.equal(result[1].password, REDACTED);
    assert.equal(result[1].label, 'second');
  });
});
