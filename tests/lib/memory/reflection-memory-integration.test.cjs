const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { createReflectionEventHandlers } = require('../../../.claude/hooks/reflection/unified-reflection-events.cjs');
const { createReflectionActions } = require('../../../.claude/hooks/reflection/unified-reflection-actions.cjs');
const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');
const reflectionHandler = require('../../../.claude/hooks/reflection/unified-reflection-handler.cjs');

const TEST_ROOT = path.resolve(
  __dirname,
  '..',
  'context',
  'memory',
  '.test-reflection-memory-integration'
);
const MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');

function resetFixture() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

beforeEach(() => {
  resetFixture();
});

after(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('reflection memory integration (S6-S8)', () => {
  test('S6: MemoryRecord gotcha is persisted via reflection actions with write source metadata', () => {
    const actions = createReflectionActions({
      projectRoot: TEST_ROOT,
      isEnabled: () => true,
      appendJsonl: () => {},
      auditLog: () => {},
      debugLog: () => {},
      mlIndex: null,
      reflectionQueueMaxLines: 100,
    });

    actions.recordMemoryItems({
      patterns: [],
      gotchas: [
        {
          text: 'Always validate hook payload schema before processing',
          area: 'hooks',
          source: 'reflection',
          confidence: 0.92,
        },
      ],
      discoveries: [],
    });

    const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
    assert.equal(fs.existsSync(gotchasFile), true);
    const gotchas = loadJson(gotchasFile);
    assert.equal(gotchas.length, 1);
    assert.equal(gotchas[0].source, 'reflection');
    assert.equal(gotchas[0].writeSource, 'reflection');
    assert.equal(gotchas[0].confidence, 0.92);
  });

  test('S7: event handler recognizes MemoryRecord and maps tool input into extracted memory items', () => {
    const handlers = createReflectionEventHandlers({
      getToolName: input => input.tool_name || input.tool,
      getToolInput: input => input.tool_input || input.input || {},
      getToolOutput: input => input.tool_output || input.output || null,
      debugLog: () => {},
      routerState: { recordTaskUpdate: () => {} },
      taskClaimLedger: { releaseClaim: () => {} },
      parseAndValidateTaskUpdate: input => ({ normalized: input || {} }),
      gatherSessionInsights: () => ({}),
      errorSummaryExtractor: null,
      sessionEndEvents: ['Stop', 'SessionEnd'],
      minOutputLength: 50,
    });

    const hookInput = {
      tool_name: 'MemoryRecord',
      tool_input: {
        type: 'gotcha',
        content: 'Never bypass TaskUpdate summary metadata requirements',
        area: 'routing',
        source: 'reflection',
        confidence: 0.88,
      },
    };

    const eventType = handlers.detectEventType(hookInput);
    assert.equal(eventType, 'memory_extraction');

    const extracted = handlers.handleMemoryExtraction(hookInput);
    assert.deepEqual(extracted.gotchas, [
      {
        text: 'Never bypass TaskUpdate summary metadata requirements',
        area: 'routing',
        source: 'reflection',
        confidence: 0.88,
        taskId: undefined,
      },
    ]);
    assert.deepEqual(extracted.patterns, []);
    assert.deepEqual(extracted.discoveries, []);
  });

  test('S8: memory manager persists source/writeSource/confidence for object writes', () => {
    const gotchaOk = memoryManager.recordGotcha(
      {
        text: 'TaskUpdate completion must include metadata.summary',
        area: 'workflow',
        source: 'reflection',
        confidence: 0.9,
      },
      TEST_ROOT
    );
    assert.equal(gotchaOk, true);

    const patternOk = memoryManager.recordPattern(
      {
        text: 'Prefer task-pretool orchestrator before direct spawn',
        area: 'routing',
        source: 'reflection',
        confidence: 0.86,
      },
      TEST_ROOT
    );
    assert.equal(patternOk, true);

    const gotchas = loadJson(path.join(MEMORY_DIR, 'gotchas.json'));
    const patterns = loadJson(path.join(MEMORY_DIR, 'patterns.json'));

    assert.equal(gotchas[0].source, 'reflection');
    assert.equal(gotchas[0].writeSource, 'reflection');
    assert.equal(gotchas[0].confidence, 0.9);

    assert.equal(patterns[0].source, 'reflection');
    assert.equal(patterns[0].writeSource, 'reflection');
    assert.equal(patterns[0].confidence, 0.86);
  });

  test('S12: MemoryRecord flow writes STM entry via memory tiers', async () => {
    const actions = createReflectionActions({
      projectRoot: TEST_ROOT,
      isEnabled: () => true,
      appendJsonl: () => {},
      auditLog: () => {},
      debugLog: () => {},
      mlIndex: null,
      reflectionQueueMaxLines: 100,
    });

    await actions.recordMemoryItems({
      patterns: [],
      gotchas: [
        {
          text: 'Record STM write for reflection memory event',
          area: 'memory',
          source: 'reflection',
          confidence: 0.81,
          taskId: 'task-12',
        },
      ],
      discoveries: [],
    });

    const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
    assert.equal(fs.existsSync(stmPath), true);
    const stm = loadJson(stmPath);
    assert.equal(stm.type, 'gotcha');
    assert.equal(stm.source, 'reflection');
    assert.equal(stm.taskId, 'task-12');
  });

  test('S13: semantic read helper queries contextual memory and injects prior learnings', async () => {
    process.env.REFLECTION_SEMANTIC_READ = 'on';
    try {
      const entry = {
        summary: 'Task completion metadata missing',
        trigger: 'task_completion',
      };
      const enriched = await reflectionHandler.attachSemanticPriorLearnings(entry, {
        contextualMemory: {
          search: async (_query, options) => [
            {
              content: 'Prior learning: enforce metadata.summary at TaskUpdate completion',
              metadata: { area: 'validation' },
            },
          ].slice(0, options.limit || 5),
        },
      });

      assert.equal(Array.isArray(enriched.priorRelatedLearnings), true);
      assert.equal(enriched.priorRelatedLearnings.length, 1);
      assert.match(enriched.priorRelatedLearnings[0], /metadata\.summary/i);
      assert.equal(enriched.memoryReadSource, 'semantic+static');
    } finally {
      delete process.env.REFLECTION_SEMANTIC_READ;
    }
  });

  test('S14: reflection log entry includes memoryWrites and memoryReadSource', async () => {
    const entry = {
      taskId: 'task-14',
      trigger: 'memory_extraction',
      memoryWrites: [{ type: 'gotcha', source: 'reflection', dedup: 'create' }],
      memoryReadSource: 'semantic+static',
    };

    await reflectionHandler.appendReflectionLogEntry(entry, { projectRoot: TEST_ROOT });

    const reflectionLogPath = path.join(MEMORY_DIR, 'reflection-log.jsonl');
    assert.equal(fs.existsSync(reflectionLogPath), true);
    const lines = fs.readFileSync(reflectionLogPath, 'utf8').trim().split('\n');
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert.deepEqual(parsed.memoryWrites, entry.memoryWrites);
    assert.equal(parsed.memoryReadSource, 'semantic+static');
  });
});
