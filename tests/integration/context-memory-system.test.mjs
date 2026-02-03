import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const reflectionHook = require('../../.claude/hooks/reflection/unified-reflection-handler.cjs');
const promptAssembler = require('../../.claude/lib/spawn/prompt-assembler.cjs');

function listFilesSafe(dir) {
  try {
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  } catch {
    return [];
  }
}

function removeFiles(dir, names) {
  for (const name of names) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // Best-effort cleanup.
    }
  }
}

test('validatePathWithinProject is Windows-case tolerant for drive letters', () => {
  if (process.platform !== 'win32') {
    return;
  }

  const { validatePathWithinProject } = require('../../.claude/lib/utils/project-root.cjs');

  const flipDrive = p => {
    const m = p.match(/^([a-zA-Z]):(.*)$/);
    if (!m) return p;
    const drive = m[1];
    const rest = m[2];
    const flipped = drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase();
    return `${flipped}:${rest}`;
  };

  const altRoot = flipDrive(PROJECT_ROOT);
  assert.notEqual(altRoot, PROJECT_ROOT, 'Test requires different-cased path');

  const res = validatePathWithinProject(altRoot, PROJECT_ROOT);
  assert.equal(res.safe, true, `Expected safe path; got: ${res.reason || 'unknown reason'}`);
});

test('SessionEnd uses active_context.md to populate sessionData', () => {
  const activeContextPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'memory',
    'active_context.md'
  );
  const original = fs.existsSync(activeContextPath)
    ? fs.readFileSync(activeContextPath, 'utf8')
    : null;

  try {
    fs.mkdirSync(path.dirname(activeContextPath), { recursive: true });
    fs.writeFileSync(
      activeContextPath,
      [
        'This is the session summary.',
        '',
        '## Tasks Completed',
        '- Did A',
        '- Did B',
        '',
        '## Patterns Found',
        '- Use Zod for validation',
        '',
        '## Gotchas',
        '- Windows path casing matters',
        '',
        '## Next Steps',
        '- Add integration tests',
      ].join('\n'),
      'utf8'
    );

    const result = reflectionHook.handleSessionEnd({
      event: 'SessionEnd',
      session_id: 'test-session',
    });
    assert.equal(result.sessionData.summary, 'This is the session summary.');
    assert.deepEqual(result.sessionData.tasks_completed, ['Did A', 'Did B']);
    assert.deepEqual(result.sessionData.patterns_found, ['Use Zod for validation']);
    assert.deepEqual(result.sessionData.gotchas_encountered, ['Windows path casing matters']);
    assert.deepEqual(result.sessionData.next_steps, ['Add integration tests']);
  } finally {
    if (original === null) {
      try {
        fs.unlinkSync(activeContextPath);
      } catch {
        // ignore
      }
    } else {
      fs.writeFileSync(activeContextPath, original, 'utf8');
    }
  }
});

test('recordSession persists session into MTM (canonical) and does not require legacy sessions/', async () => {
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const mtmDir = path.join(memoryDir, 'mtm');

  // Ensure MTM dir exists
  fs.mkdirSync(mtmDir, { recursive: true });

  // Use a temp directory for LanceDB to avoid polluting real data
  const tempLanceDir = path.join(os.tmpdir(), `test-lancedb-${Date.now()}`);
  process.env.LANCEDB_URI = tempLanceDir;

  const beforeMTM = new Set(listFilesSafe(mtmDir));

  try {
    const sessionData = {
      session_id: `test-session-${Date.now()}`,
      summary: 'Test session persistence',
      tasks_completed: ['Task 1'],
      files_modified: [],
      discoveries: [],
      patterns_found: [],
      gotchas_encountered: [],
      decisions_made: [],
      next_steps: [],
      timestamp: new Date().toISOString(),
    };

    // recordSession triggers embedding generation which uses LANCEDB_URI
    await reflectionHook.recordSession(sessionData);

    const afterMTM = new Set(listFilesSafe(mtmDir));

    // MTM should receive a consolidated session file.
    const mtmChanged = [...afterMTM].some(f => !beforeMTM.has(f) && /^session_/.test(f));
    assert.ok(mtmChanged, 'Expected MTM directory to change');

    // Cleanup (only remove new files we created).
    const newMTM = [...afterMTM].filter(f => !beforeMTM.has(f) && f !== '.gitkeep');
    removeFiles(mtmDir, newMTM);
  } finally {
    // Cleanup LanceDB temp dir
    delete process.env.LANCEDB_URI;
    if (fs.existsSync(tempLanceDir)) {
      try {
        fs.rmSync(tempLanceDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

test('assembleSpawnPrompt injects Memory Context section when enabled', () => {
  const basePrompt = [
    '# Agent',
    '',
    '## Memory Protocol',
    '1) Read: .claude/context/memory/learnings.md (before starting)',
    '2) Write: decisions/issues/learnings to appropriate memory files',
    '',
    '## PROJECT CONTEXT',
    'Test prompt.',
  ].join('\n');

  const out = promptAssembler.assembleSpawnPrompt({
    agentType: 'developer',
    allowedTools: [],
    basePrompt,
    includeMemory: true,
  });

  assert.ok(
    out.includes('## Memory Context (Auto-Loaded)'),
    'Expected memory section to be injected'
  );
});
