'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatText,
  formatJson,
  formatStreamJson,
  formatStreamJsonRpc,
  OutputFormatter,
} = require('../../.claude/lib/exec/output-formatter.cjs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Typical exec result object */
const SAMPLE_RESULT = {
  result: 'Hello, world!',
  exitCode: 0,
  tokensUsed: 1234,
  duration: 5000,
};

/** Events for stream formatters */
const SAMPLE_EVENTS = [
  { type: 'start', timestamp: 1000 },
  { type: 'token', data: 'Hello', timestamp: 2000 },
  { type: 'token', data: 'world', timestamp: 3000 },
  { type: 'done', exitCode: 0, timestamp: 4000 },
];

// ---------------------------------------------------------------------------
// formatText — VAL-HE-004
// ---------------------------------------------------------------------------
describe('formatText', () => {
  it('returns a non-empty string', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.strictEqual(typeof output, 'string');
    assert.ok(output.length > 0, 'Output should not be empty');
  });

  it('produces multiline output', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.ok(output.includes('\n'), 'Output should contain newlines for multiline format');
  });

  it('includes the result content', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.ok(output.includes('Hello, world!'), 'Output should include the result content');
  });

  it('includes exit code information', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.ok(output.includes('0'), 'Output should include the exit code');
  });

  it('includes token usage information', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.ok(output.includes('1234'), 'Output should include token count');
  });

  it('includes duration information', () => {
    const output = formatText(SAMPLE_RESULT);
    assert.ok(output.includes('5000'), 'Output should include duration');
  });

  it('handles non-zero exit code', () => {
    const result = { result: 'error output', exitCode: 1, tokensUsed: 10, duration: 100 };
    const output = formatText(result);
    assert.ok(output.includes('1'), 'Output should include non-zero exit code');
    assert.ok(output.includes('error output'), 'Output should include error content');
  });

  it('handles empty result string', () => {
    const result = { result: '', exitCode: 0, tokensUsed: 0, duration: 0 };
    const output = formatText(result);
    assert.strictEqual(typeof output, 'string');
    assert.ok(output.length > 0, 'Should still produce output even with empty result');
  });
});

// ---------------------------------------------------------------------------
// formatJson — VAL-HE-004
// ---------------------------------------------------------------------------
describe('formatJson', () => {
  it('returns a valid JSON string', () => {
    const output = formatJson(SAMPLE_RESULT);
    assert.strictEqual(typeof output, 'string');
    assert.doesNotThrow(() => JSON.parse(output), 'Output must be valid JSON');
  });

  it('parsed JSON contains result field', () => {
    const parsed = JSON.parse(formatJson(SAMPLE_RESULT));
    assert.strictEqual(parsed.result, 'Hello, world!');
  });

  it('parsed JSON contains exitCode field', () => {
    const parsed = JSON.parse(formatJson(SAMPLE_RESULT));
    assert.strictEqual(parsed.exitCode, 0);
  });

  it('parsed JSON contains tokensUsed field', () => {
    const parsed = JSON.parse(formatJson(SAMPLE_RESULT));
    assert.strictEqual(parsed.tokensUsed, 1234);
  });

  it('parsed JSON contains duration field', () => {
    const parsed = JSON.parse(formatJson(SAMPLE_RESULT));
    assert.strictEqual(parsed.duration, 5000);
  });

  it('contains all four required fields', () => {
    const parsed = JSON.parse(formatJson(SAMPLE_RESULT));
    assert.ok('result' in parsed, 'Missing "result" field');
    assert.ok('exitCode' in parsed, 'Missing "exitCode" field');
    assert.ok('tokensUsed' in parsed, 'Missing "tokensUsed" field');
    assert.ok('duration' in parsed, 'Missing "duration" field');
  });

  it('preserves non-zero exitCode', () => {
    const result = { result: 'failure', exitCode: 2, tokensUsed: 50, duration: 200 };
    const parsed = JSON.parse(formatJson(result));
    assert.strictEqual(parsed.exitCode, 2);
  });
});

// ---------------------------------------------------------------------------
// formatStreamJson — VAL-HE-004
// ---------------------------------------------------------------------------
describe('formatStreamJson', () => {
  it('returns a string', () => {
    const output = formatStreamJson(SAMPLE_EVENTS);
    assert.strictEqual(typeof output, 'string');
  });

  it('produces one line per event', () => {
    const output = formatStreamJson(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, SAMPLE_EVENTS.length);
  });

  it('each line is valid JSON', () => {
    const output = formatStreamJson(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Line is not valid JSON: ${line}`);
    }
  });

  it('each parsed line contains the original event data', () => {
    const output = formatStreamJson(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    const parsed = lines.map(l => JSON.parse(l));
    assert.strictEqual(parsed[0].type, 'start');
    assert.strictEqual(parsed[1].type, 'token');
    assert.strictEqual(parsed[1].data, 'Hello');
    assert.strictEqual(parsed[3].exitCode, 0);
  });

  it('handles single event array', () => {
    const output = formatStreamJson([{ type: 'ping' }]);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), { type: 'ping' });
  });

  it('handles empty events array', () => {
    const output = formatStreamJson([]);
    assert.strictEqual(typeof output, 'string');
    // Empty input should produce empty or whitespace-only output
    assert.strictEqual(output.trim(), '');
  });
});

// ---------------------------------------------------------------------------
// formatStreamJsonRpc — VAL-HE-004
// ---------------------------------------------------------------------------
describe('formatStreamJsonRpc', () => {
  it('returns a string', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    assert.strictEqual(typeof output, 'string');
  });

  it('produces one line per event', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, SAMPLE_EVENTS.length);
  });

  it('each line is valid JSON', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Line is not valid JSON: ${line}`);
    }
  });

  it('each notification has jsonrpc: "2.0"', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const notification = JSON.parse(line);
      assert.strictEqual(notification.jsonrpc, '2.0', 'jsonrpc must be "2.0"');
    }
  });

  it('each notification has a method field', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const notification = JSON.parse(line);
      assert.ok('method' in notification, 'Notification must have a method field');
      assert.strictEqual(typeof notification.method, 'string');
      assert.ok(notification.method.length > 0, 'Method must be non-empty');
    }
  });

  it('each notification has a params field containing the event data', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const notification = JSON.parse(line);
      assert.ok('params' in notification, 'Notification must have a params field');
    }
    // Params should contain the original event data
    const firstNotification = JSON.parse(lines[0]);
    assert.ok(
      JSON.stringify(firstNotification.params).includes('start'),
      'params should contain original event data'
    );
  });

  it('notifications have no id field (notifications vs requests)', () => {
    const output = formatStreamJsonRpc(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const notification = JSON.parse(line);
      assert.ok(!('id' in notification), 'JSON-RPC 2.0 notifications must not have an id field');
    }
  });

  it('handles single event array', () => {
    const output = formatStreamJsonRpc([{ type: 'ping' }]);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const notification = JSON.parse(lines[0]);
    assert.strictEqual(notification.jsonrpc, '2.0');
    assert.ok('method' in notification);
    assert.ok('params' in notification);
  });

  it('handles empty events array', () => {
    const output = formatStreamJsonRpc([]);
    assert.strictEqual(typeof output, 'string');
    assert.strictEqual(output.trim(), '');
  });
});

// ---------------------------------------------------------------------------
// OutputFormatter class — VAL-HE-004
// ---------------------------------------------------------------------------
describe('OutputFormatter constructor', () => {
  it('accepts "text" format', () => {
    assert.doesNotThrow(() => new OutputFormatter('text'));
  });

  it('accepts "json" format', () => {
    assert.doesNotThrow(() => new OutputFormatter('json'));
  });

  it('accepts "stream-json" format', () => {
    assert.doesNotThrow(() => new OutputFormatter('stream-json'));
  });

  it('accepts "stream-jsonrpc" format', () => {
    assert.doesNotThrow(() => new OutputFormatter('stream-jsonrpc'));
  });

  it('throws for unknown format', () => {
    assert.throws(() => new OutputFormatter('unknown-format'), Error);
  });

  it('throws for empty string format', () => {
    assert.throws(() => new OutputFormatter(''), Error);
  });

  it('throws with descriptive error message for unknown format', () => {
    try {
      new OutputFormatter('yaml');
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.ok(err.message.length > 0, 'Error message should be non-empty');
      assert.ok(
        err.message.includes('yaml') || err.message.toLowerCase().includes('unknown'),
        'Error should mention the invalid format or say "unknown"'
      );
    }
  });
});

describe('OutputFormatter.format dispatch', () => {
  it('dispatches to formatText for "text" format', () => {
    const formatter = new OutputFormatter('text');
    const output = formatter.format(SAMPLE_RESULT);
    assert.strictEqual(typeof output, 'string');
    assert.ok(output.includes('Hello, world!'), 'text format should include result content');
    assert.ok(output.includes('\n'), 'text format should be multiline');
  });

  it('dispatches to formatJson for "json" format', () => {
    const formatter = new OutputFormatter('json');
    const output = formatter.format(SAMPLE_RESULT);
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.result, 'Hello, world!');
    assert.strictEqual(parsed.exitCode, 0);
    assert.strictEqual(parsed.tokensUsed, 1234);
    assert.strictEqual(parsed.duration, 5000);
  });

  it('dispatches to formatStreamJson for "stream-json" format', () => {
    const formatter = new OutputFormatter('stream-json');
    const output = formatter.format(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, SAMPLE_EVENTS.length);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });

  it('dispatches to formatStreamJsonRpc for "stream-jsonrpc" format', () => {
    const formatter = new OutputFormatter('stream-jsonrpc');
    const output = formatter.format(SAMPLE_EVENTS);
    const lines = output.trim().split('\n');
    assert.strictEqual(lines.length, SAMPLE_EVENTS.length);
    for (const line of lines) {
      const notification = JSON.parse(line);
      assert.strictEqual(notification.jsonrpc, '2.0');
    }
  });

  it('format method returns a string for all valid formats', () => {
    const textOut = new OutputFormatter('text').format(SAMPLE_RESULT);
    const jsonOut = new OutputFormatter('json').format(SAMPLE_RESULT);
    const streamJsonOut = new OutputFormatter('stream-json').format(SAMPLE_EVENTS);
    const streamRpcOut = new OutputFormatter('stream-jsonrpc').format(SAMPLE_EVENTS);

    assert.strictEqual(typeof textOut, 'string');
    assert.strictEqual(typeof jsonOut, 'string');
    assert.strictEqual(typeof streamJsonOut, 'string');
    assert.strictEqual(typeof streamRpcOut, 'string');
  });
});
