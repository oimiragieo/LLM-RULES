'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  ExecEngine,
  parseExecFlags,
  readPromptFromFile,
} = require('../../.claude/lib/exec/engine.cjs');
// Note: PermissionViolationError is thrown internally by the engine; we check error.type string

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock processPrompt function for injection into ExecEngine.
 *
 * @param {object} [opts]
 * @param {string}  [opts.result]          - The result string to return
 * @param {number}  [opts.tokensUsed=100]  - Tokens to report
 * @param {string}  [opts.shouldThrowTool] - If set, calls toolInterceptor with this tool name
 * @returns {Function}
 */
function makeMockProcessPrompt({ result = 'Mock result', tokensUsed = 100, shouldThrowTool } = {}) {
  return async (prompt, { toolInterceptor }) => {
    if (shouldThrowTool) {
      toolInterceptor(shouldThrowTool); // Throws PermissionViolationError if blocked
    }
    return { result: result || `Processed: ${prompt}`, tokensUsed };
  };
}

// ---------------------------------------------------------------------------
// ExecEngine — constructor
// ---------------------------------------------------------------------------

describe('ExecEngine constructor', () => {
  it('constructs with default options', () => {
    const engine = new ExecEngine({ _processPrompt: makeMockProcessPrompt() });
    assert.ok(engine instanceof ExecEngine);
  });

  it('exposes the tier on the instance', () => {
    const engine = new ExecEngine({ tier: 'low', _processPrompt: makeMockProcessPrompt() });
    assert.strictEqual(engine.tier, 'low');
  });

  it('defaults to readOnly tier', () => {
    const engine = new ExecEngine({ _processPrompt: makeMockProcessPrompt() });
    assert.strictEqual(engine.tier, 'readOnly');
  });

  it('defaults to text output format', () => {
    const engine = new ExecEngine({ _processPrompt: makeMockProcessPrompt() });
    assert.strictEqual(engine.outputFormat, 'text');
  });

  it('throws on unknown autonomy tier', () => {
    assert.throws(
      () => new ExecEngine({ tier: 'unknown', _processPrompt: makeMockProcessPrompt() }),
      /Unknown autonomy tier/
    );
  });

  it('throws on unknown output format', () => {
    assert.throws(
      () => new ExecEngine({ outputFormat: 'xml', _processPrompt: makeMockProcessPrompt() }),
      /Unknown output format/
    );
  });
});

// ---------------------------------------------------------------------------
// ExecEngine — successful execution — VAL-HE-006
// ---------------------------------------------------------------------------

describe('ExecEngine run — successful execution', () => {
  it('returns exitCode 0 on success — VAL-HE-006', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ result: 'Hello' }),
    });
    const result = await engine.run('test prompt');
    assert.strictEqual(result.exitCode, 0);
  });

  it('returns the LLM result string', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ result: 'Hello world' }),
    });
    const result = await engine.run('test prompt');
    assert.strictEqual(result.result, 'Hello world');
  });

  it('reports token usage — VAL-HE-006', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ result: 'x', tokensUsed: 42 }),
    });
    const result = await engine.run('test prompt');
    assert.strictEqual(result.tokensUsed, 42);
  });

  it('reports duration as a non-negative number — VAL-HE-006', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt(),
    });
    const result = await engine.run('test prompt');
    assert.ok(typeof result.duration === 'number', 'duration should be a number');
    assert.ok(result.duration >= 0, 'duration should be >= 0');
  });

  it('passes the prompt to the processPrompt function', async () => {
    let capturedPrompt = null;
    const processPrompt = async (prompt, { toolInterceptor: _toolInterceptor }) => {
      capturedPrompt = prompt;
      return { result: 'done', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    await engine.run('my specific prompt');
    assert.strictEqual(capturedPrompt, 'my specific prompt');
  });
});

// ---------------------------------------------------------------------------
// ExecEngine — permission enforcement — VAL-HE-003
// ---------------------------------------------------------------------------

describe('ExecEngine run — permission enforcement', () => {
  it('returns exitCode 1 when a blocked tool is called — VAL-HE-003', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Execute' }),
    });
    const result = await engine.run('test prompt');
    assert.strictEqual(result.exitCode, 1);
  });

  it('returns structured error object on violation — VAL-HE-003', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Execute' }),
    });
    const result = await engine.run('test prompt');
    assert.ok(result.error, 'Should have an error object');
    assert.strictEqual(result.error.type, 'PermissionViolationError');
    assert.strictEqual(result.error.toolName, 'Execute');
    assert.strictEqual(result.error.currentTier, 'readOnly');
    assert.ok(result.error.requiredTier, 'Should include requiredTier');
  });

  it('stops execution immediately on violation — VAL-HE-003', async () => {
    let executedAfterViolation = false;
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('Execute'); // Should throw PermissionViolationError
      executedAfterViolation = true; // Must NOT reach here
      return { result: 'x', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(executedAfterViolation, false, 'Code after violation should not execute');
  });

  it('allows permitted tools to pass through the interceptor', async () => {
    let toolCalled = false;
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('Read'); // Read is allowed in readOnly tier
      toolCalled = true;
      return { result: 'ok', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(toolCalled, true);
  });

  it('readOnly tier blocks Edit tool — VAL-HE-001', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Edit' }),
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.error.toolName, 'Edit');
  });

  it('low tier allows Edit tool — VAL-HE-002', async () => {
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('Edit'); // Should NOT throw for low tier
      return { result: 'ok', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'low',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 0);
  });

  it('low tier blocks Execute tool — VAL-HE-002', async () => {
    const engine = new ExecEngine({
      tier: 'low',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Execute' }),
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1);
  });

  it('medium tier allows Execute tool — VAL-HE-002', async () => {
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('Execute');
      return { result: 'ok', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'medium',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 0);
  });

  it('skipPermissions tier allows all tools — VAL-HE-002', async () => {
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('GitPush');
      toolInterceptor('Execute');
      toolInterceptor('AnyTool');
      return { result: 'ok', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'skipPermissions',
      outputFormat: 'text',
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// ExecEngine — output formatting — VAL-HE-004
// ---------------------------------------------------------------------------

describe('ExecEngine run — output formatting', () => {
  it('formats output as text — VAL-HE-004', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      _processPrompt: makeMockProcessPrompt({ result: 'Hello' }),
    });
    const result = await engine.run('test');
    assert.ok(typeof result.formatted === 'string', 'formatted should be a string');
    assert.ok(result.formatted.includes('Hello'), 'text format should contain the result');
    assert.ok(result.formatted.includes('\n'), 'text format should be multiline');
  });

  it('formats output as JSON — VAL-HE-004', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'json',
      _processPrompt: makeMockProcessPrompt({ result: 'Hello' }),
    });
    const result = await engine.run('test');
    assert.ok(typeof result.formatted === 'string');
    const parsed = JSON.parse(result.formatted);
    assert.ok('result' in parsed, 'JSON format should have result field');
    assert.ok('exitCode' in parsed, 'JSON format should have exitCode field');
    assert.ok('tokensUsed' in parsed, 'JSON format should have tokensUsed field');
    assert.ok('duration' in parsed, 'JSON format should have duration field');
  });

  it('exitCode in JSON output matches the actual exitCode', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'json',
      _processPrompt: makeMockProcessPrompt({ result: 'ok' }),
    });
    const result = await engine.run('test');
    const parsed = JSON.parse(result.formatted);
    assert.strictEqual(parsed.exitCode, result.exitCode);
  });

  it('formats permission violation error in JSON — VAL-HE-003 + VAL-HE-004', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'json',
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Execute' }),
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.formatted);
    assert.strictEqual(parsed.exitCode, 1);
  });
});

// ---------------------------------------------------------------------------
// ExecEngine — CWD option — VAL-HE-005
// ---------------------------------------------------------------------------

describe('ExecEngine run — cwd option', () => {
  let tmpDir;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-engine-cwd-'));
  });
  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  });

  it('changes working directory during run — VAL-HE-005', async () => {
    const originalCwd = process.cwd();
    let cwdDuringRun = null;

    const processPrompt = async (_prompt, { toolInterceptor: _toolInterceptor }) => {
      cwdDuringRun = process.cwd();
      return { result: 'done', tokensUsed: 0 };
    };

    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      cwd: tmpDir,
      _processPrompt: processPrompt,
    });

    await engine.run('test');

    assert.strictEqual(
      path.normalize(cwdDuringRun),
      path.normalize(tmpDir),
      'cwd should be changed during run'
    );
    // After run, cwd should be restored
    assert.strictEqual(process.cwd(), originalCwd, 'cwd should be restored after run');
  });

  it('restores cwd even if processPrompt throws — VAL-HE-005', async () => {
    const originalCwd = process.cwd();

    const processPrompt = async (_prompt, { toolInterceptor: _toolInterceptor }) => {
      throw new Error('Unexpected error');
    };

    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      cwd: tmpDir,
      _processPrompt: processPrompt,
    });

    try {
      await engine.run('test');
    } catch (_) {
      // Expected to throw
    }
    assert.strictEqual(process.cwd(), originalCwd, 'cwd should be restored even after error');
  });
});

// ---------------------------------------------------------------------------
// ExecEngine — enabledTools / disabledTools options
// ---------------------------------------------------------------------------

describe('ExecEngine — enabledTools and disabledTools', () => {
  it('disabledTools blocks a tool that the tier normally allows', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      disabledTools: ['Read'],
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Read' }),
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1, 'Should be blocked by disabledTools');
  });

  it('enabledTools allows a tool that the tier normally blocks', async () => {
    const processPrompt = async (prompt, { toolInterceptor }) => {
      toolInterceptor('Execute'); // Normally blocked in readOnly, but explicitly enabled
      return { result: 'ok', tokensUsed: 0 };
    };
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      enabledTools: ['Execute'],
      _processPrompt: processPrompt,
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 0, 'enabledTools should allow the tool');
  });

  it('disabledTools takes priority over enabledTools', async () => {
    const engine = new ExecEngine({
      tier: 'readOnly',
      outputFormat: 'text',
      enabledTools: ['Read'],
      disabledTools: ['Read'],
      _processPrompt: makeMockProcessPrompt({ shouldThrowTool: 'Read' }),
    });
    const result = await engine.run('test');
    assert.strictEqual(result.exitCode, 1, 'disabledTools should override enabledTools');
  });
});

// ---------------------------------------------------------------------------
// parseExecFlags — VAL-HE-005
// ---------------------------------------------------------------------------

describe('parseExecFlags', () => {
  it('returns empty object for empty argv', () => {
    const result = parseExecFlags([]);
    assert.deepEqual(result, {});
  });

  it('parses -m flag as model — VAL-HE-005', () => {
    const result = parseExecFlags(['-m', 'claude-3-5-sonnet']);
    assert.strictEqual(result.model, 'claude-3-5-sonnet');
  });

  it('parses -r flag as reasoningEffort — VAL-HE-005', () => {
    const result = parseExecFlags(['-r', 'high']);
    assert.strictEqual(result.reasoningEffort, 'high');
  });

  it('parses -f flag as promptFile — VAL-HE-005', () => {
    const result = parseExecFlags(['-f', '/path/to/prompt.txt']);
    assert.strictEqual(result.promptFile, '/path/to/prompt.txt');
  });

  it('parses -s flag as session — VAL-HE-005', () => {
    const result = parseExecFlags(['-s', 'session-abc123']);
    assert.strictEqual(result.session, 'session-abc123');
  });

  it('parses --auto flag as tier shorthand', () => {
    assert.strictEqual(parseExecFlags(['--auto', 'low']).auto, 'low');
    assert.strictEqual(parseExecFlags(['--auto', 'medium']).auto, 'medium');
    assert.strictEqual(parseExecFlags(['--auto', 'high']).auto, 'high');
  });

  it('parses --output flag as output format', () => {
    const result = parseExecFlags(['--output', 'json']);
    assert.strictEqual(result.output, 'json');
  });

  it('parses --cwd flag as cwd — VAL-HE-005', () => {
    const result = parseExecFlags(['--cwd', '/some/directory']);
    assert.strictEqual(result.cwd, '/some/directory');
  });

  it('parses --enabled-tools as comma-separated array', () => {
    const result = parseExecFlags(['--enabled-tools', 'Read,Write,Execute']);
    assert.deepEqual(result.enabledTools, ['Read', 'Write', 'Execute']);
  });

  it('parses --disabled-tools as comma-separated array', () => {
    const result = parseExecFlags(['--disabled-tools', 'Execute,GitPush']);
    assert.deepEqual(result.disabledTools, ['Execute', 'GitPush']);
  });

  it('parses --skip-permissions-unsafe as skipPermissions tier', () => {
    const result = parseExecFlags(['--skip-permissions-unsafe']);
    assert.strictEqual(result.auto, 'skipPermissions');
  });

  it('treats first non-flag argument as prompt', () => {
    const result = parseExecFlags(['my prompt here']);
    assert.strictEqual(result.prompt, 'my prompt here');
  });

  it('handles multiple flags together', () => {
    const result = parseExecFlags([
      '-m',
      'claude-3-5-sonnet',
      '--output',
      'json',
      '--auto',
      'high',
    ]);
    assert.strictEqual(result.model, 'claude-3-5-sonnet');
    assert.strictEqual(result.output, 'json');
    assert.strictEqual(result.auto, 'high');
  });

  it('handles prompt with flags', () => {
    const result = parseExecFlags(['-m', 'claude-opus', 'do something useful']);
    assert.strictEqual(result.model, 'claude-opus');
    assert.strictEqual(result.prompt, 'do something useful');
  });
});

// ---------------------------------------------------------------------------
// readPromptFromFile — VAL-HE-005
// ---------------------------------------------------------------------------

describe('readPromptFromFile', () => {
  let tmpDir;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-engine-file-'));
  });
  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore
    }
  });

  it('reads prompt content from file — VAL-HE-005', () => {
    const filePath = path.join(tmpDir, 'prompt.txt');
    fs.writeFileSync(filePath, 'Prompt from file', 'utf8');
    const content = readPromptFromFile(filePath);
    assert.strictEqual(content, 'Prompt from file');
  });

  it('reads multiline prompt from file', () => {
    const filePath = path.join(tmpDir, 'multiline.txt');
    fs.writeFileSync(filePath, 'Line one\nLine two\nLine three', 'utf8');
    const content = readPromptFromFile(filePath);
    assert.strictEqual(content, 'Line one\nLine two\nLine three');
  });

  it('throws if file does not exist', () => {
    assert.throws(() => readPromptFromFile('/nonexistent/path/to/file.txt'), /ENOENT/);
  });
});
