'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const { getCurrentContextName, getCurrentModeNames } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'config', 'resolve-runtime-context.cjs')
);

const RUNTIME_DIR = path.join(__dirname, '..', '..', '..', '.claude', 'context', 'runtime');
const CURRENT_CONTEXT_PATH = path.join(RUNTIME_DIR, 'current-context.json');
const CURRENT_MODES_PATH = path.join(RUNTIME_DIR, 'current-modes.json');
const RUNTIME_CONTEXT_MODULE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'lib',
  'config',
  'resolve-runtime-context.cjs'
);

function readFileOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

test('resolve runtime context prefers current-context.json', () => {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const prevContext = readFileOrNull(CURRENT_CONTEXT_PATH);
  const prevModes = readFileOrNull(CURRENT_MODES_PATH);
  const prevEnvContext = process.env.AGENT_STUDIO_CONTEXT;
  const prevEnvModes = process.env.AGENT_STUDIO_MODES;

  process.env.AGENT_STUDIO_CONTEXT = 'env-context';
  process.env.AGENT_STUDIO_MODES = 'env-mode';

  fs.writeFileSync(
    CURRENT_CONTEXT_PATH,
    JSON.stringify({ context: 'file-context', modes: ['file-mode'] }, null, 2),
    'utf8'
  );
  fs.writeFileSync(CURRENT_MODES_PATH, JSON.stringify({ modes: ['mode-file'] }, null, 2), 'utf8');

  try {
    assert.strictEqual(getCurrentContextName(), 'file-context');
    assert.deepStrictEqual(getCurrentModeNames(), ['file-mode']);
  } finally {
    if (prevContext === null) fs.unlinkSync(CURRENT_CONTEXT_PATH);
    else fs.writeFileSync(CURRENT_CONTEXT_PATH, prevContext, 'utf8');

    if (prevModes === null) fs.unlinkSync(CURRENT_MODES_PATH);
    else fs.writeFileSync(CURRENT_MODES_PATH, prevModes, 'utf8');

    if (prevEnvContext === undefined) delete process.env.AGENT_STUDIO_CONTEXT;
    else process.env.AGENT_STUDIO_CONTEXT = prevEnvContext;

    if (prevEnvModes === undefined) delete process.env.AGENT_STUDIO_MODES;
    else process.env.AGENT_STUDIO_MODES = prevEnvModes;
  }
});

test('resolve runtime modes uses current-modes.json when context modes absent', () => {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const prevContext = readFileOrNull(CURRENT_CONTEXT_PATH);
  const prevModes = readFileOrNull(CURRENT_MODES_PATH);
  const prevEnvModes = process.env.AGENT_STUDIO_MODES;

  process.env.AGENT_STUDIO_MODES = 'env-mode';

  fs.writeFileSync(
    CURRENT_CONTEXT_PATH,
    JSON.stringify({ context: 'file-context' }, null, 2),
    'utf8'
  );
  fs.writeFileSync(CURRENT_MODES_PATH, JSON.stringify({ modes: ['mode-file'] }, null, 2), 'utf8');

  try {
    assert.deepStrictEqual(getCurrentModeNames(), ['mode-file']);
  } finally {
    if (prevContext === null) fs.unlinkSync(CURRENT_CONTEXT_PATH);
    else fs.writeFileSync(CURRENT_CONTEXT_PATH, prevContext, 'utf8');

    if (prevModes === null) fs.unlinkSync(CURRENT_MODES_PATH);
    else fs.writeFileSync(CURRENT_MODES_PATH, prevModes, 'utf8');

    if (prevEnvModes === undefined) delete process.env.AGENT_STUDIO_MODES;
    else process.env.AGENT_STUDIO_MODES = prevEnvModes;
  }
});

test('resolve runtime context falls back to env when files missing', () => {
  const prevContext = readFileOrNull(CURRENT_CONTEXT_PATH);
  const prevModes = readFileOrNull(CURRENT_MODES_PATH);
  const prevEnvContext = process.env.AGENT_STUDIO_CONTEXT;
  const prevEnvModes = process.env.AGENT_STUDIO_MODES;

  if (fs.existsSync(CURRENT_CONTEXT_PATH)) fs.unlinkSync(CURRENT_CONTEXT_PATH);
  if (fs.existsSync(CURRENT_MODES_PATH)) fs.unlinkSync(CURRENT_MODES_PATH);

  process.env.AGENT_STUDIO_CONTEXT = 'env-context';
  process.env.AGENT_STUDIO_MODES = 'mode-one,mode-two';

  try {
    assert.strictEqual(getCurrentContextName(), 'env-context');
    assert.deepStrictEqual(getCurrentModeNames(), ['mode-one', 'mode-two']);
  } finally {
    if (prevContext !== null) fs.writeFileSync(CURRENT_CONTEXT_PATH, prevContext, 'utf8');
    if (prevModes !== null) fs.writeFileSync(CURRENT_MODES_PATH, prevModes, 'utf8');

    if (prevEnvContext === undefined) delete process.env.AGENT_STUDIO_CONTEXT;
    else process.env.AGENT_STUDIO_CONTEXT = prevEnvContext;

    if (prevEnvModes === undefined) delete process.env.AGENT_STUDIO_MODES;
    else process.env.AGENT_STUDIO_MODES = prevEnvModes;
  }
});

test('resolve runtime context returns empty when no files or env', () => {
  const prevContext = readFileOrNull(CURRENT_CONTEXT_PATH);
  const prevModes = readFileOrNull(CURRENT_MODES_PATH);
  const prevEnvContext = process.env.AGENT_STUDIO_CONTEXT;
  const prevEnvModes = process.env.AGENT_STUDIO_MODES;

  if (fs.existsSync(CURRENT_CONTEXT_PATH)) fs.unlinkSync(CURRENT_CONTEXT_PATH);
  if (fs.existsSync(CURRENT_MODES_PATH)) fs.unlinkSync(CURRENT_MODES_PATH);
  delete process.env.AGENT_STUDIO_CONTEXT;
  delete process.env.AGENT_STUDIO_MODES;

  try {
    assert.strictEqual(getCurrentContextName(), null);
    assert.deepStrictEqual(getCurrentModeNames(), []);
  } finally {
    if (prevContext !== null) fs.writeFileSync(CURRENT_CONTEXT_PATH, prevContext, 'utf8');
    if (prevModes !== null) fs.writeFileSync(CURRENT_MODES_PATH, prevModes, 'utf8');

    if (prevEnvContext !== undefined) process.env.AGENT_STUDIO_CONTEXT = prevEnvContext;
    if (prevEnvModes !== undefined) process.env.AGENT_STUDIO_MODES = prevEnvModes;
  }
});

test('resolve-runtime-context uses safeParseJSON for runtime files', () => {
  const src = fs.readFileSync(RUNTIME_CONTEXT_MODULE_PATH, 'utf8');
  assert.ok(src.includes('safeParseJSON'), 'resolve-runtime-context should use safeParseJSON');
});
