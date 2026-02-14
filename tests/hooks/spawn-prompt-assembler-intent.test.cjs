'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawn } = require('node:child_process');

const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'routing',
  'spawn-prompt-assembler.cjs'
);

function writePreloadScript(tempDir, _capturePath) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const intentPath = path.join(projectRoot, '.claude', 'lib', 'memory', 'intent-analyzer.cjs');
  const memoryManagerPath = path.join(
    projectRoot,
    '.claude',
    'lib',
    'memory',
    'memory-manager.cjs'
  );

  const lines = [
    "const fs = require('fs');",
    'const capturePath = process.env.SPAWN_PROMPT_INTENT_CAPTURE;',
    `const intentPath = ${JSON.stringify(intentPath)};`,
    `const memoryManagerPath = ${JSON.stringify(memoryManagerPath)};`,
    '',
    'require.cache[intentPath] = {',
    '  id: intentPath,',
    '  filename: intentPath,',
    '  loaded: true,',
    '  exports: {',
    '    analyzeIntent: async () => ({',
    '      queries: [',
    '        {',
    "          query: 'intent query',",
    "          context_type: 'memory',",
    "          category: 'preferences',",
    '          priority: 1,',
    '        },',
    '      ],',
    '    }),',
    '  },',
    '};',
    '',
    'require.cache[memoryManagerPath] = {',
    '  id: memoryManagerPath,',
    '  filename: memoryManagerPath,',
    '  loaded: true,',
    '  exports: {',
    '    loadMemoryForContextAsync: async () => ({ recent_sessions: [] }),',
    '    searchMemory: async (_query, options) => {',
    '      if (capturePath) {',
    "        fs.writeFileSync(capturePath, JSON.stringify(options), 'utf8');",
    '      }',
    '      return [',
    '        {',
    "          content: 'intent match',",
    '          metadata: {},',
    '          similarity: 1,',
    "          source: 'lancedb',",
    '        },',
    '      ];',
    '    },',
    '  },',
    '};',
    '',
  ];

  const preloadContents = lines.join('\n');
  const preloadPath = path.join(tempDir, 'spawn-prompt-assembler-intent-preload.cjs');
  fs.writeFileSync(preloadPath, preloadContents, 'utf8');
  return preloadPath;
}

async function runHookWithIntent(capturePath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-intent-'));
  const preloadPath = writePreloadScript(tempDir, capturePath);

  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      env: {
        ...process.env,
        NODE_OPTIONS: '--require ' + preloadPath,
        MEMORY_INTENT_ANALYSIS: '1',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'on',
        SPAWN_PROMPT_ASSEMBLER: 'on',
        SPAWN_PROMPT_INTENT_CAPTURE: capturePath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      resolve({ code: code ?? 0, stdout, stderr });
    });

    const input = {
      tool_name: 'Task',
      tool_input: {
        task_id: 'intent-test-1',
        subagent_type: 'developer',
        prompt: 'Please review the system for issues.',
        description: 'Run a quick review',
        allowed_tools: ['Read', 'TaskUpdate'],
      },
    };

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

test('spawn-prompt-assembler intent analysis uses memory contextType filter', async () => {
  const capturePath = path.join(os.tmpdir(), `intent-capture-${Date.now()}.json`);

  try {
    const result = await runHookWithIntent(capturePath);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('tool_input'));

    if (fs.existsSync(capturePath)) {
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      assert.equal(captured.contextType, 'memory');
      assert.equal(captured.category, 'preferences');
      assert.ok(typeof captured.filters === 'string');
      assert.ok(captured.filters.includes('metadata NOT LIKE'));
    }
  } finally {
    if (fs.existsSync(capturePath)) {
      fs.rmSync(capturePath, { force: true });
    }
  }
});
