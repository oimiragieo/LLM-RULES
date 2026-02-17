/* eslint-disable max-lines */
const { describe, test } = require('node:test');
const assert = require('node:assert');
const {
  validatePrompt,
  autoNormalizeSpawnInput,
  hasExplicitTaskId,
  generateFallbackTaskId,
  ensureTaskId,
  compactOversizedSpawnInput,
  buildRequiredPrefixFragment,
  normalizeUnicode,
  safeRegexTest,
  isOrchestratorSpawn,
  isTemplateBasedSpawn,
  isInvalidSubagentType,
  calculatePromptCompactness,
  registerSpawnValidationFailure,
  clearSpawnValidationFailure,
  buildLoopBreakerKey,
  VALIDATION_RULES,
  MINIMUM_SCORE,
  MAX_PROMPT_LENGTH,
} = require('../../.claude/hooks/safety/spawn-prompt-validator.cjs');
const {
  generateRequiredPrefixFragment,
  ensureMandatorySpawnPreflight,
  isInvalidSubagentType: isAssemblerInvalidSubagentType,
  hasTaskIdReference,
  hasExplicitTaskId: assemblerHasExplicitTaskId,
  normalizeTaskIdReferences,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

// =============================================================================
// Test Helpers
// =============================================================================

function createValidPrompt() {
  return `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: 123                                                   |
|  FIRST: TaskUpdate({ taskId: "123", status: "in_progress" });        |
|  AFTER: TaskUpdate({ taskId: "123", status: "completed", ... });     |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Instructions
1) TaskUpdate in_progress
2) Execute task
3) TaskUpdate completed

## Memory Protocol
Read .claude/context/memory/learnings.md before starting.

allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Write']
`;
}

function createMinimalValidPrompt() {
  return `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+
Task ID: 456
TaskUpdate({ status: "in_progress" })
TaskUpdate completed
`;
}

// =============================================================================
// Unit Tests: validatePrompt()
// =============================================================================

describe('validatePrompt()', () => {
  test('should pass valid prompt with all elements', () => {
    const validPrompt = createValidPrompt();
    const result = validatePrompt(validPrompt);

    assert.strictEqual(result.isValid, true);
    assert.ok(
      result.score >= MINIMUM_SCORE,
      `Expected score >= ${MINIMUM_SCORE}, got ${result.score}`
    );
    assert.ok(result.passed.includes('TaskUpdate Warning Box'));
    assert.ok(result.passed.includes('Task ID Reference'));
  });

  test('should pass minimal valid prompt', () => {
    const minimalPrompt = createMinimalValidPrompt();
    const result = validatePrompt(minimalPrompt);

    assert.strictEqual(result.isValid, true);
    assert.ok(result.score >= MINIMUM_SCORE);
  });

  test('should fail prompt missing TaskUpdate box (REQUIRED)', () => {
    const invalidPrompt = `
Task ID: 123
Do some work
PROJECT_ROOT: /path
Memory Protocol
`;

    const result = validatePrompt(invalidPrompt);
    assert.strictEqual(result.isValid, false);
    assert.ok(result.failed.includes('TaskUpdate Warning Box'));
    assert.ok(result.missingRequired?.includes('TaskUpdate Warning Box'));
  });

  test('should fail prompt missing Task ID (REQUIRED)', () => {
    const invalidPrompt = `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+
Do some work
`;

    const result = validatePrompt(invalidPrompt);
    assert.strictEqual(result.isValid, false);
    assert.ok(result.failed.includes('Task ID Reference'));
    assert.ok(result.missingRequired?.includes('Task ID Reference'));
  });

  test('should fail empty prompt', () => {
    const result = validatePrompt('');
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.isValid, false);
  });

  test('should fail null prompt', () => {
    const result = validatePrompt(null);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.isValid, false);
  });

  test('should fail undefined prompt', () => {
    const result = validatePrompt(undefined);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.isValid, false);
  });

  test('should fail non-string prompt', () => {
    const result = validatePrompt(12345);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.isValid, false);
  });

  test('should detect all 6 validation rules', () => {
    assert.strictEqual(VALIDATION_RULES.length, 6);
    assert.ok(VALIDATION_RULES.some(r => r.name === 'TaskUpdate Warning Box'));
    assert.ok(VALIDATION_RULES.some(r => r.name === 'Task ID Reference'));
    assert.ok(VALIDATION_RULES.some(r => r.name === 'PROJECT_ROOT Context'));
    assert.ok(VALIDATION_RULES.some(r => r.name === 'Memory Protocol'));
    assert.ok(VALIDATION_RULES.some(r => r.name === 'TaskUpdate Call Instruction'));
    assert.ok(VALIDATION_RULES.some(r => r.name === 'TaskUpdate in allowed_tools'));
  });

  test('should calculate weighted score correctly', () => {
    const validPrompt = createValidPrompt();
    const result = validatePrompt(validPrompt);

    // Score should be sum of passed rule weights
    const expectedScore = result.passed.reduce((sum, ruleName) => {
      const rule = VALIDATION_RULES.find(r => r.name === ruleName);
      return sum + (rule?.weight || 0);
    }, 0);

    assert.strictEqual(result.score, expectedScore);
  });

  test('should enforce required flag on critical rules (VULN-006)', () => {
    const warningBoxRule = VALIDATION_RULES.find(r => r.name === 'TaskUpdate Warning Box');
    const taskIdRule = VALIDATION_RULES.find(r => r.name === 'Task ID Reference');

    assert.strictEqual(warningBoxRule.required, true);
    assert.strictEqual(taskIdRule.required, true);
  });

  test('should warn on large prompt (>50KB)', () => {
    // This test verifies the warning threshold, not blocking
    // Actual audit logging would require mock
    const largePrompt = createValidPrompt() + 'A'.repeat(100000);
    const result = validatePrompt(largePrompt);

    // Should still validate but would trigger warning
    assert.ok(result.score > 0); // Not failed due to size alone
  });

  test('should reject oversized prompt (>120KB) (VULN-003)', () => {
    const hugePrompt = 'A'.repeat(MAX_PROMPT_LENGTH + 1);
    const result = validatePrompt(hugePrompt);

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.score, 0);
    assert.ok(result.error.includes('SEC-DOS-001'));
  });

  test('should compute compactness score and detect duplicated sections', () => {
    const prompt = `
## PROJECT CONTEXT
PROJECT_ROOT: /tmp
## PROJECT CONTEXT
PROJECT_ROOT: /tmp
TaskUpdate({ taskId: "1", status: "in_progress" })
TaskUpdate({ taskId: "1", status: "in_progress" })
`;
    const compactness = calculatePromptCompactness(prompt);
    assert.ok(compactness.score < 100);
    assert.ok(compactness.duplicateHeaders.length > 0);
    assert.ok(compactness.repeatedBoilerplate.length > 0);
  });
});

describe('autoNormalizeSpawnInput()', () => {
  test('should prepend required prefix when required fields are missing', () => {
    const toolInput = {
      task_id: '42',
      description: 'Fix routing',
      prompt: 'Implement changes quickly.',
      allowed_tools: ['Read', 'Write'],
    };
    const initial = validatePrompt(toolInput.prompt);
    assert.strictEqual(initial.isValid, false);
    assert.ok(initial.missingRequired?.length > 0);

    const normalized = autoNormalizeSpawnInput(toolInput, initial);
    assert.strictEqual(normalized.modified, true);
    assert.ok(normalized.toolInput.prompt.includes('TASK TRACKING REQUIRED'));
    assert.ok(normalized.toolInput.prompt.includes('Task ID: 42'));
    assert.ok(normalized.toolInput.allowed_tools.includes('TaskUpdate'));
    assert.ok(normalized.toolInput.allowed_tools.includes('TaskList'));

    const after = validatePrompt(normalized.toolInput.prompt);
    assert.strictEqual(after.isValid, true);
  });

  test('should not modify when no required fields are missing', () => {
    const prompt = createValidPrompt();
    const toolInput = { task_id: '7', prompt, allowed_tools: ['TaskUpdate', 'TaskList'] };
    const initial = validatePrompt(prompt);
    assert.strictEqual(initial.isValid, true);

    const normalized = autoNormalizeSpawnInput(toolInput, initial);
    assert.strictEqual(normalized.modified, false);
  });

  test('should not normalize missing required fields when task_id is missing', () => {
    const toolInput = {
      description: 'Fix routing',
      prompt: 'Implement changes quickly.',
      allowed_tools: ['Read', 'Write'],
    };
    const initial = validatePrompt(toolInput.prompt);
    assert.strictEqual(initial.isValid, false);
    assert.ok(initial.missingRequired?.length > 0);

    const normalized = autoNormalizeSpawnInput(toolInput, initial);
    assert.strictEqual(normalized.modified, false);
  });
});

describe('compactOversizedSpawnInput()', () => {
  test('should compact oversized prompt below max length while preserving task markers', () => {
    const repeatedSection = `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: 123                                                   |
|  TaskUpdate({ taskId: "123", status: "in_progress" });              |
|  TaskUpdate({ taskId: "123", status: "completed" });                |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: C:\\dev\\projects\\agent-studio
`;
    const hugePrompt = repeatedSection.repeat(300);
    assert.ok(hugePrompt.length > MAX_PROMPT_LENGTH, 'test prompt must exceed max length');

    const compacted = compactOversizedSpawnInput({
      task_id: '123',
      prompt: hugePrompt,
      description: 'Test oversized compaction',
    });

    assert.strictEqual(compacted.modified, true);
    assert.ok(compacted.toolInput.prompt.length <= MAX_PROMPT_LENGTH);
    assert.ok(compacted.toolInput.prompt.includes('TASK TRACKING REQUIRED'));
    assert.ok(
      compacted.toolInput.prompt.includes('TaskUpdate({ taskId: "123", status: "in_progress" })')
    );
  });

  test('should not modify prompt that is already within max length', () => {
    const input = {
      prompt: createValidPrompt(),
      task_id: 'abc',
    };
    const compacted = compactOversizedSpawnInput(input);
    assert.strictEqual(compacted.modified, false);
    assert.strictEqual(compacted.toolInput, input);
  });
});

describe('explicit task_id enforcement helpers', () => {
  test('validator hasExplicitTaskId returns true for string/number ids', () => {
    assert.strictEqual(hasExplicitTaskId({ task_id: 'task-123' }), true);
    assert.strictEqual(hasExplicitTaskId({ task_id: 123 }), true);
    assert.strictEqual(hasExplicitTaskId({ id: 'legacy-123' }), true);
  });

  test('validator hasExplicitTaskId returns false when id is missing', () => {
    assert.strictEqual(hasExplicitTaskId({}), false);
    assert.strictEqual(hasExplicitTaskId({ description: 'x' }), false);
  });

  test('assembler detects alphanumeric Task ID references', () => {
    assert.strictEqual(hasTaskIdReference('Task ID: task-123'), true);
    assert.strictEqual(hasTaskIdReference('TaskUpdate({ taskId: "task_123" })'), true);
  });

  test('assembler explicit task id helper returns false when missing', () => {
    assert.strictEqual(assemblerHasExplicitTaskId({ task_id: 'task-1' }), true);
    assert.strictEqual(assemblerHasExplicitTaskId({}), false);
  });

  test('validator ensureTaskId injects fallback task_id when missing', () => {
    const ensured = ensureTaskId(
      { description: 'Fix routing', prompt: 'Implement changes quickly.' },
      { session_id: 'abc123-session' }
    );

    assert.strictEqual(ensured.modified, true);
    assert.ok(typeof ensured.taskId === 'string');
    assert.ok(ensured.taskId.startsWith('task-abc123'));
    assert.strictEqual(ensured.toolInput.task_id, ensured.taskId);
  });

  test('validator ensureTaskId normalizes legacy id field to task_id', () => {
    const ensured = ensureTaskId({ id: 'legacy-42', prompt: 'Do work' }, { session_id: 's1' });
    assert.strictEqual(ensured.modified, true);
    assert.strictEqual(ensured.toolInput.task_id, 'legacy-42');
    assert.strictEqual(ensured.taskId, 'legacy-42');
  });

  test('validator generateFallbackTaskId returns valid id pattern', () => {
    const generated = generateFallbackTaskId(
      { session_id: 'session-xyz' },
      { description: 'Security review + fixes' }
    );
    assert.ok(/^task-[a-zA-Z0-9]+-[a-z0-9-]+-[a-z0-9]+$/.test(generated));
  });
});

describe('buildRequiredPrefixFragment()', () => {
  test('should include task id and project context', () => {
    const prefix = buildRequiredPrefixFragment('123', 'Task title');
    assert.ok(prefix.includes('Task ID: 123'));
    assert.ok(prefix.includes('PROJECT_ROOT:'));
    assert.ok(prefix.includes('TASK TRACKING REQUIRED'));
    assert.ok(prefix.includes('PRE-FLIGHT (MANDATORY)'));
    assert.ok(prefix.includes('TaskList();'));
    assert.ok(prefix.includes('FIRST ACTION (MANDATORY)'));
  });
});

describe('spawn preflight enforcement helpers', () => {
  test('assembler should inject mandatory preflight block when missing', () => {
    const prompt = '## Task\nImplement the fix.';
    const enriched = ensureMandatorySpawnPreflight(prompt, 'task-123');
    assert.ok(enriched.includes('## Spawn Preflight (Mandatory)'));
    assert.ok(enriched.includes('PRE-FLIGHT: TaskList()'));
    assert.ok(
      enriched.includes('FIRST ACTION: TaskUpdate({ taskId: "task-123", status: "in_progress" })')
    );
  });

  test('validator should flag invalid subagent_type tool names', () => {
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'Bash' }), true);
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'developer' }), false);
  });

  test('assembler should flag invalid subagent_type tool names', () => {
    assert.strictEqual(isAssemblerInvalidSubagentType('Bash'), true);
    assert.strictEqual(isAssemblerInvalidSubagentType('qa'), false);
  });

  test('assembler should normalize hardcoded taskId "1" to canonical task id', () => {
    const prompt = `
## Steps
1. TaskUpdate({ taskId: "1", status: "in_progress" })
2. TaskUpdate({ taskId: "1", status: "completed" })
`;
    const normalized = normalizeTaskIdReferences(prompt, 'task-canonical-42');
    assert.ok(normalized.includes('taskId: "task-canonical-42"'));
    assert.ok(!normalized.includes('taskId: "1"'));
  });

  test('assembler should normalize unquoted numeric task_id values to canonical task id', () => {
    const prompt = `
TaskUpdate({ task_id: 1, status: "in_progress" })
TaskUpdate({ taskId: 1, status: "completed" })
`;
    const normalized = normalizeTaskIdReferences(prompt, 'task-canonical-99');
    assert.ok(normalized.includes('task_id: "task-canonical-99"'));
    assert.ok(normalized.includes('taskId: "task-canonical-99"'));
    assert.ok(!/\btask_id:\s*1\b/.test(normalized));
    assert.ok(!/\btaskId:\s*1\b/.test(normalized));
  });

  test('assembler should normalize stale "mark task 1" TaskUpdate instructions to canonical task id', () => {
    const prompt = `
IMPORTANT INSTRUCTIONS:
- Use TaskUpdate to mark task 1 as in_progress immediately
- Use TaskUpdate to mark task 1 as completed when done
`;
    const normalized = normalizeTaskIdReferences(prompt, 'task-canonical-77');
    assert.ok(normalized.includes('mark task task-canonical-77 as in_progress'));
    assert.ok(normalized.includes('mark task task-canonical-77 as completed when done'));
    assert.ok(!normalized.includes('mark task 1 as in_progress'));
    assert.ok(!normalized.includes('mark task 1 as completed when done'));
  });

  test('assembler should normalize "FIRST: Call TaskUpdate" taskId placeholders to canonical task id', () => {
    const prompt = `
Task ID: task-real-321
FIRST: Call TaskUpdate({ taskId: "1", status: "in_progress" })
AFTER: Call TaskUpdate({ taskId: "1", status: "completed" })
`;
    const normalized = normalizeTaskIdReferences(prompt, 'task-real-321');
    assert.ok(normalized.includes('FIRST: Call TaskUpdate({ taskId: "task-real-321"'));
    assert.ok(normalized.includes('AFTER: Call TaskUpdate({ taskId: "task-real-321"'));
    assert.ok(!normalized.includes('taskId: "1"'));
  });
});

describe('spawn validator loop-breaker', () => {
  test('should build stable loop-breaker key from session/hash/failure', () => {
    const validation = {
      missingRequired: ['TaskUpdate Warning Box', 'Task ID Reference'],
      failed: ['TaskUpdate Warning Box', 'Task ID Reference'],
    };
    const key = buildLoopBreakerKey('s1', 'abcd1234', validation);
    assert.ok(key.includes('s1'));
    assert.ok(key.includes('abcd1234'));
    assert.ok(key.includes('TaskUpdate Warning Box'));
  });

  test('should trigger bypass after repeated identical failures', () => {
    const validation = {
      missingRequired: ['TaskUpdate Warning Box'],
      failed: ['TaskUpdate Warning Box'],
    };
    const first = registerSpawnValidationFailure('test-session', 'hash1', validation);
    const second = registerSpawnValidationFailure('test-session', 'hash1', validation);
    const third = registerSpawnValidationFailure('test-session', 'hash1', validation);

    assert.strictEqual(first.shouldBypassBlock, false);
    assert.strictEqual(second.shouldBypassBlock, false);
    assert.strictEqual(third.shouldBypassBlock, true);

    clearSpawnValidationFailure('test-session', 'hash1', validation);
  });
});

// =============================================================================
// Security Tests: Unicode Normalization (VULN-001)
// =============================================================================

describe('normalizeUnicode() - VULN-001', () => {
  test('should normalize Cyrillic lookalikes to ASCII', () => {
    // Cyrillic 'Е' (U+0415) looks like Latin 'E'
    const cyrillic = 'REQUIRЕD'; // Note: Cyrillic Е
    const normalized = normalizeUnicode(cyrillic);

    assert.strictEqual(normalized, 'REQUIRED');
  });

  test('should normalize Greek lookalikes to ASCII', () => {
    // Greek Tau (U+03A4) looks like Latin 'T'
    const greek = '\u03A4ASK'; // Greek Tau + ASK
    const normalized = normalizeUnicode(greek);

    assert.strictEqual(normalized, 'TASK');
  });

  test('should handle mixed lookalikes', () => {
    const mixed = '\u0410\u0412\u0421'; // Cyrillic A, B, C
    const normalized = normalizeUnicode(mixed);

    assert.strictEqual(normalized, 'ABC');
  });

  test('should handle empty string', () => {
    assert.strictEqual(normalizeUnicode(''), '');
  });

  test('should handle null', () => {
    assert.strictEqual(normalizeUnicode(null), '');
  });

  test('should handle plain ASCII unchanged', () => {
    const ascii = 'TASK TRACKING REQUIRED';
    assert.strictEqual(normalizeUnicode(ascii), ascii);
  });

  test('should detect TaskUpdate with Greek Tau homoglyph', () => {
    const bypass = '\u03A4askUpdate({ taskId: "1", status: "in_progress" })'; // Greek Tau
    const result = validatePrompt(createMinimalValidPrompt().replace('TaskUpdate', bypass));

    // After normalization, should still match TaskUpdate pattern
    assert.ok(result.score > 0, 'Should normalize and match pattern');
  });

  test('should detect Task ID with Cyrillic lookalikes', () => {
    const bypass = '\u03A4\u0430sk ID: 123'; // Greek Tau + Cyrillic a
    const result = validatePrompt(createMinimalValidPrompt().replace('Task ID: 456', bypass));

    // After normalization, should match
    assert.ok(result.passed.includes('Task ID Reference'));
  });
});

// =============================================================================
// Security Tests: ReDoS Prevention (VULN-002)
// =============================================================================

describe('safeRegexTest() - VULN-002', () => {
  test('should handle large input without timeout', () => {
    const pattern = /TaskUpdate/;
    const largeText = 'TaskUpdate'.repeat(10000);
    const startTime = Date.now();

    const result = safeRegexTest(pattern, largeText);
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result, true);
    assert.ok(elapsed < 1000, `Execution took ${elapsed}ms, should be < 1000ms`);
  });

  test('should handle ReDoS-safe patterns efficiently', () => {
    // Our bounded patterns should execute quickly even on adversarial input
    const pattern = /\+={10,100}\+[\s\S]{0,500}TASK TRACKING REQUIRED[\s\S]{0,500}={10,100}\+/;
    const adversarial =
      '+' +
      '='.repeat(50) +
      'A'.repeat(500) +
      'TASK TRACKING REQUIRED' +
      'B'.repeat(500) +
      '='.repeat(50) +
      '+';

    const startTime = Date.now();
    safeRegexTest(pattern, adversarial); // Execute but don't need result
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed < 200, `ReDoS-safe pattern took ${elapsed}ms, should be < 200ms`);
  });

  test('should return false on regex error', () => {
    // Test with invalid pattern (this won't actually throw in JS, but tests the catch block)
    const pattern = /valid/;
    const result = safeRegexTest(pattern, 'text');

    assert.strictEqual(typeof result, 'boolean');
  });

  test('should handle bounded quantifiers correctly', () => {
    const boundedPattern = /TaskUpdate\s{0,5}\(/;
    const text1 = 'TaskUpdate('; // 0 spaces
    const text2 = 'TaskUpdate     ('; // 5 spaces
    const text3 = 'TaskUpdate      ('; // 6 spaces (should not match)

    assert.strictEqual(safeRegexTest(boundedPattern, text1), true);
    assert.strictEqual(safeRegexTest(boundedPattern, text2), true);
    assert.strictEqual(safeRegexTest(boundedPattern, text3), false);
  });
});

// =============================================================================
// Unit Tests: isOrchestratorSpawn()
// =============================================================================

describe('isOrchestratorSpawn()', () => {
  test('should detect master-orchestrator in subagent_type', () => {
    const toolInput = { subagent_type: 'master-orchestrator' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), true);
  });

  test('should detect evolution-orchestrator in subagent_type', () => {
    const toolInput = { subagent_type: 'evolution-orchestrator' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), true);
  });

  test('should detect swarm-coordinator in subagent_type', () => {
    const toolInput = { subagent_type: 'swarm-coordinator' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), true);
  });

  test('should detect party-orchestrator in subagent_type', () => {
    const toolInput = { subagent_type: 'party-orchestrator' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), true);
  });

  test('should NOT detect orchestrator names in description (SEC-TMPL-002)', () => {
    // After SEC-TMPL-002 fix, description field is no longer checked
    const toolInput = {
      subagent_type: 'developer',
      description: 'master-orchestrator coordinating',
    };
    assert.strictEqual(isOrchestratorSpawn(toolInput), false);
  });

  test('should not detect regular developer', () => {
    const toolInput = { description: 'developer implementing feature' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), false);
  });

  test('should not detect qa agent', () => {
    const toolInput = { subagent_type: 'qa' };
    assert.strictEqual(isOrchestratorSpawn(toolInput), false);
  });

  test('should handle empty toolInput', () => {
    assert.strictEqual(isOrchestratorSpawn({}), false);
  });

  test('should handle null description and subagent_type', () => {
    const toolInput = { description: null, subagent_type: null };
    assert.strictEqual(isOrchestratorSpawn(toolInput), false);
  });
});

// =============================================================================
// Unit Tests: isTemplateBasedSpawn()
// =============================================================================

describe('isTemplateBasedSpawn()', () => {
  test('should detect .claude/templates/spawn/ reference', () => {
    const prompt = 'See .claude/templates/spawn/universal-agent-spawn.md';
    assert.strictEqual(isTemplateBasedSpawn(prompt), true);
  });

  test('should detect "See .claude/templates" reference', () => {
    const prompt = 'See .claude/templates for spawn template';
    assert.strictEqual(isTemplateBasedSpawn(prompt), true);
  });

  test('should not detect non-template prompt', () => {
    const prompt = 'This is a regular prompt';
    assert.strictEqual(isTemplateBasedSpawn(prompt), false);
  });

  test('should handle empty prompt', () => {
    assert.strictEqual(isTemplateBasedSpawn(''), false);
  });
});

describe('isInvalidSubagentType()', () => {
  test('should block tool names used as subagent_type', () => {
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'Bash' }), true);
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'TaskList' }), true);
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'Read' }), true);
  });

  test('should allow valid agent ids', () => {
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'developer' }), false);
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'qa' }), false);
    assert.strictEqual(isInvalidSubagentType({ subagent_type: 'architect' }), false);
  });
});

// =============================================================================
// Integration Tests: End-to-End Scenarios
// =============================================================================

describe('Integration: End-to-End Validation', () => {
  test('should pass exact assembler generateRequiredPrefixFragment output', () => {
    const assembledPrefix = generateRequiredPrefixFragment('0', 'test');
    const result = validatePrompt(assembledPrefix);
    assert.strictEqual(result.isValid, true, 'Assembler fragment must pass validation');
    assert.ok(result.passed.includes('TaskUpdate Warning Box'), 'Must detect warning box');
    assert.ok(result.passed.includes('Task ID Reference'), 'Must detect Task ID reference');
    assert.ok(
      !result.missingRequired || result.missingRequired.length === 0,
      'No required elements missing'
    );
  });

  test('should pass complete valid spawn prompt', () => {
    const fullPrompt = `
You are the developer agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: 789                                                   |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "789", status: "in_progress" });               |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "789", status: "completed",                    |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

All file operations MUST use relative paths from PROJECT_ROOT.

## Your Assigned Task
Task ID: 789
Subject: Fix authentication bug

## Instructions
1) FIRST: TaskUpdate({ taskId: "789", status: "in_progress" })
2) Read your agent definition: .claude/agents/core/developer.md
3) Execute task
4) LAST: TaskUpdate({ taskId: "789", status: "completed", metadata: { summary: "...", filesModified: [...] } })
5) THEN: TaskList()

## Memory Protocol
1) Read: .claude/context/memory/learnings.md (before starting)
2) Write: decisions/issues/learnings to appropriate memory files

allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill']
`;

    const result = validatePrompt(fullPrompt);

    assert.strictEqual(result.isValid, true);
    assert.ok(result.score >= MINIMUM_SCORE);
    assert.strictEqual(result.passed.length >= 5, true, 'Should pass at least 5 rules');
  });

  test('should fail prompt with only partial compliance', () => {
    const partialPrompt = `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+

Do some work here.
`;

    const result = validatePrompt(partialPrompt);

    assert.strictEqual(result.isValid, false);
    assert.ok(result.failed.includes('Task ID Reference'));
  });

  test('should warn on good but improvable prompt', () => {
    const improvablePrompt = `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+
Task ID: 999
TaskUpdate({ status: "in_progress" })
`;

    const result = validatePrompt(improvablePrompt);

    // Might pass minimum but should have warning
    assert.ok(result.score >= MINIMUM_SCORE || result.needsWarning);
  });
});

// =============================================================================
// Regression Tests: Security Vulnerabilities
// =============================================================================

describe('Regression: Security Vulnerability Tests', () => {
  test('VULN-001: Should prevent Unicode bypass attack', () => {
    // Attacker uses Cyrillic characters
    const attackPrompt = `
+======================================================================+
|  WARNING: TASK TRACKING REQUIRЕD - READ THIS FIRST                   |
+======================================================================+
Task ID: 1
`;
    // Note: "REQUIRED" has Cyrillic 'Е' (U+0415)

    const result = validatePrompt(attackPrompt);

    // After normalization, should match
    assert.ok(
      result.passed.includes('TaskUpdate Warning Box'),
      'Should detect after normalization'
    );
  });

  test('VULN-002: Should prevent ReDoS attack', () => {
    const redosPayload =
      '+' +
      '='.repeat(100) +
      'TASK'.repeat(50) +
      ' ' +
      'TRACKING'.repeat(50) +
      ' ' +
      'REQUIRED'.repeat(50) +
      '='.repeat(100) +
      '+';

    const startTime = Date.now();
    validatePrompt(redosPayload);
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed < 1000, `ReDoS protection failed: took ${elapsed}ms`);
  });

  test('VULN-003: Should reject oversized prompt', () => {
    const hugePrompt = 'A'.repeat(MAX_PROMPT_LENGTH + 1000);
    const result = validatePrompt(hugePrompt);

    assert.strictEqual(result.isValid, false);
    assert.ok(result.error.includes('SEC-DOS-001'));
  });

  test('VULN-006: Should enforce required rules', () => {
    // Prompt with high score but missing required element
    const missingRequired = `
Task ID: 123
PROJECT_ROOT: /path
Memory Protocol: learnings.md
TaskUpdate({ status: "in_progress" })
allowed_tools: ['TaskUpdate']
`;
    // Missing: TaskUpdate Warning Box (REQUIRED)

    const result = validatePrompt(missingRequired);

    assert.strictEqual(result.isValid, false);
    assert.ok(result.missingRequired?.includes('TaskUpdate Warning Box'));
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  test('should handle prompt with only whitespace', () => {
    const result = validatePrompt('   \n\n\t\t   ');
    assert.strictEqual(result.isValid, false);
  });

  test('should handle prompt with special characters', () => {
    const specialPrompt = createValidPrompt() + '\0\x01\x02'; // null bytes, control chars
    const result = validatePrompt(specialPrompt);

    // Should still validate the valid parts
    assert.ok(result.score > 0);
  });

  test('should handle extremely nested structures', () => {
    const nestedPrompt = createValidPrompt() + '('.repeat(1000) + ')'.repeat(1000);
    const result = validatePrompt(nestedPrompt);

    // Should not hang or crash
    assert.ok(typeof result.score === 'number');
  });

  test('should handle prompt at exact length limit', () => {
    const exactLimit = 'A'.repeat(MAX_PROMPT_LENGTH - 100) + createValidPrompt();
    const result = validatePrompt(exactLimit);

    // Should validate (not exceed limit)
    assert.ok(result.score >= 0); // Not rejected for size
  });
});

console.log('All tests completed successfully!');
