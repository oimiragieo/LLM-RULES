#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseCitations } = require('../helpers/parse-memory-citations.cjs');
const { runSubagentMemoryProbe } = require('../fixtures/subagent-memory-probe.cjs');
const {
  extractEvidenceIdsFromPrompt,
  parseStreamOutput,
  hasNoStreamSignal,
  computeSummary,
} = require('../helpers/live-eval-metrics.cjs');

const RUN_LIVE_EVALS = String(process.env.RUN_LIVE_SUBAGENT_EVALS || 'off').toLowerCase() === 'on';
const STRICT_THRESHOLDS =
  String(process.env.RUN_LIVE_SUBAGENT_EVALS_STRICT || 'off').toLowerCase() === 'on';
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REPORT_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'evals');
const REPORT_PATH = path.join(REPORT_DIR, 'subagent-memory-rag-live-latest.json');
const TIMEOUT_MS = Number(process.env.SUBAGENT_LIVE_EVAL_TIMEOUT_MS || 180000);
const MAX_TURNS = Number(process.env.SUBAGENT_LIVE_EVAL_MAX_TURNS || 2);
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'spawn-prompt-assembler.cjs');
const RAG_PRELOAD_PATH = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'spawn-rag-memory-stub.preload.cjs');
const MEMORY_GOTCHAS_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'gotchas.json');
const LIVE_SMOKE_CASE = {
  id: 'live-smoke',
  prompt:
    'Use Task once with subagent_type="developer" and prompt "reply READY then complete". Then answer in one sentence.',
};

const EVAL_CASES = [
  {
    id: 'live-001',
    prompt: 'Use Task once. After completion, cite one exact [mem:xxxxxxxx] or [rag:xxxxxxxx] id if visible.',
  },
  {
    id: 'live-002',
    prompt:
      'Spawn one fast developer subagent task, then give one lifecycle recommendation and cite one exact evidence id when available.',
  },
  {
    id: 'live-003',
    prompt:
      'Run one micro Task and then state one routing guardrail with one exact [mem:xxxxxxxx] or [rag:xxxxxxxx] citation if present.',
  },
];

const FALLBACK_CASES = [
  {
    id: 'hook-001',
    seedGotchas: [
      { text: 'HOOK_E2E_SENTINEL_USE_TASKUPDATE_FIRST', timestamp: '2026-02-15T00:00:00.000Z' },
    ],
    question: 'What task lifecycle safety recommendation should we follow?',
    env: { RAG_AT_SPAWN: 'off' },
    preloadPaths: [],
  },
  {
    id: 'hook-002',
    seedGotchas: null,
    question: 'What canonical task-update flow should we apply?',
    env: { RAG_AT_SPAWN: 'on' },
    preloadPaths: [RAG_PRELOAD_PATH],
  },
];

function ensureReportDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}


function runLiveCase(tc) {
  return new Promise(resolve => {
    const args = [
      '-p',
      tc.prompt,
      '-d',
      '--dangerously-skip-permissions',
      '--max-turns',
      String(MAX_TURNS),
      '--output-format',
      'stream-json',
      '--verbose',
    ];

    const child = spawn('claude', args, {
      cwd: PROJECT_ROOT,
      shell: true,
      env: {
        ...process.env,
        REFLECTION_STEP0_ENFORCEMENT: 'off',
      },
    });

    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let settled = false;

    const settle = payload => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(payload);
    };

    const timeoutHandle = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            shell: true,
            stdio: 'ignore',
          });
        } else {
          child.kill('SIGKILL');
        }
      } catch (_killErr) {
        // best effort
      }

      const partial = parseStreamOutput(stdout);
      settle({
        id: tc.id,
        ok: false,
        exitCode: -1,
        error: `timeout after ${TIMEOUT_MS}ms`,
        ...partial,
        stderr,
      });
    }, TIMEOUT_MS);

    child.stdout.on('data', chunk => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk || '');
    });
    child.on('error', err => {
      spawnError = err;
    });

    child.on('close', code => {
      if (spawnError) {
        settle({
          id: tc.id,
          ok: false,
          exitCode: -1,
          error: String(spawnError.message || spawnError),
          spawnedEvidenceIds: [],
          outputCitations: [],
          grounded: false,
          stderr,
        });
        return;
      }

      const parsed = parseStreamOutput(stdout);
      settle({
        id: tc.id,
        ok: code === 0,
        exitCode: code,
        ...parsed,
        stderr,
      });
    });
  });
}

async function withTemporaryFile(filePath, temporaryContents, fn) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const existed = fs.existsSync(filePath);
  const original = existed ? fs.readFileSync(filePath, 'utf8') : null;
  fs.writeFileSync(filePath, temporaryContents, 'utf8');
  try {
    return await fn();
  } finally {
    if (existed) {
      fs.writeFileSync(filePath, original, 'utf8');
    } else if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function buildHookInput(taskId) {
  return {
    tool_name: 'Task',
    tool_input: {
      task_id: taskId,
      subagent_type: 'developer',
      description: 'Live eval hook fallback diagnostic task',
      prompt: ['You are DEVELOPER.', '', '## PROJECT CONTEXT', `PROJECT_ROOT: ${PROJECT_ROOT}`].join(
        '\n'
      ),
      allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
    },
  };
}

function runHookCase(tc) {
  return new Promise(resolve => {
    const preloadArgs = (tc.preloadPaths || []).flatMap(preloadPath => ['--require', preloadPath]);
    const proc = spawn(process.execPath, [...preloadArgs, HOOK_PATH], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SPAWN_PROMPT_ASSEMBLER: 'on',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
        SPAWN_PROMPT_ENTITY_GRAPH: 'off',
        SPAWN_PROMPT_MEMORY_QUERY: 'off',
        SPAWN_ASSEMBLY_CACHE: 'off',
        MEMORY_INTENT_ANALYSIS: '0',
        ...(tc.env || {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => {
      stdout += String(chunk || '');
    });
    proc.stderr.on('data', chunk => {
      stderr += String(chunk || '');
    });
    proc.on('close', code => {
      if ((code ?? 1) !== 0) {
        resolve({
          id: tc.id,
          ok: false,
          exitCode: code ?? 1,
          error: `hook exited with code ${code ?? 1}`,
          spawnedEvidenceIds: [],
          outputCitations: [],
          grounded: false,
          finalResultText: '',
          stderr,
        });
        return;
      }
      try {
        const payload = JSON.parse(String(stdout || '').trim());
        const prompt = String(payload?.tool_input?.prompt || '');
        const ids = extractEvidenceIdsFromPrompt(prompt);
        resolve({
          id: tc.id,
          ok: true,
          exitCode: 0,
          error: null,
          spawnedEvidenceIds: ids,
          injectedPrompt: prompt,
          outputCitations: [],
          grounded: false,
          finalResultText: '',
          stderr,
        });
      } catch (err) {
        resolve({
          id: tc.id,
          ok: false,
          exitCode: 1,
          error: `hook parse failure: ${err.message}`,
          spawnedEvidenceIds: [],
          outputCitations: [],
          grounded: false,
          finalResultText: '',
          stderr,
        });
      }
    });

    proc.stdin.write(JSON.stringify(buildHookInput(tc.id)));
    proc.stdin.end();
  });
}

async function runFallbackSuite() {
  const results = [];
  for (const tc of FALLBACK_CASES) {
    if (Array.isArray(tc.seedGotchas)) {
      const seeded = JSON.stringify(tc.seedGotchas, null, 2);
      const result = await withTemporaryFile(MEMORY_GOTCHAS_PATH, seeded, () => runHookCase(tc));
      results.push(result);
    } else {
      const result = await runHookCase(tc);
      results.push(result);
    }
  }
  return results;
}

function runDeterministicProbeSuite(hookResults) {
  const casesById = new Map(FALLBACK_CASES.map(tc => [tc.id, tc]));
  return hookResults.map(result => {
    if (!result.ok || !result.injectedPrompt) {
      return {
        id: result.id,
        ok: false,
        exitCode: result.exitCode,
        error: result.error || 'no injected prompt from hook fallback',
        spawnedEvidenceIds: Array.isArray(result.spawnedEvidenceIds) ? result.spawnedEvidenceIds : [],
        outputCitations: [],
        grounded: false,
        finalResultText: '',
        stderr: result.stderr || '',
      };
    }

    const tc = casesById.get(result.id) || {};
    const probe = runSubagentMemoryProbe({
      prompt: result.injectedPrompt,
      question: tc.question || 'Use available memory evidence and cite one ID.',
    });
    const answer = String(probe?.answer || '');
    const outputCitations = [
      ...new Set([...(probe?.citations || []), ...parseCitations(answer)]),
    ];
    const spawnedEvidenceIds = Array.isArray(result.spawnedEvidenceIds) ? result.spawnedEvidenceIds : [];
    const grounded =
      outputCitations.length > 0 && outputCitations.every(id => spawnedEvidenceIds.includes(id));

    return {
      id: result.id,
      ok: true,
      exitCode: 0,
      error: null,
      spawnedEvidenceIds,
      outputCitations,
      grounded,
      finalResultText: answer,
      stderr: result.stderr || '',
    };
  });
}

function shouldUseFallback(summary) {
  return summary.timed_out_cases === summary.total_cases || summary.output_observed_rate === 0;
}

async function collectLiveResults(smokeShortCircuited) {
  if (smokeShortCircuited) return [];
  const results = [];
  for (const tc of EVAL_CASES) {
    const result = await runLiveCase(tc);
    results.push(result);
  }
  return results;
}

async function collectFallbackData(fallbackTriggered) {
  if (!fallbackTriggered) {
    return {
      fallbackResults: [],
      fallbackSummary: null,
      deterministicProbeResults: [],
      deterministicProbeSummary: null,
    };
  }
  const fallbackResults = await runFallbackSuite();
  const fallbackSummary = computeSummary(fallbackResults);
  const deterministicProbeResults = runDeterministicProbeSuite(fallbackResults);
  const deterministicProbeSummary = computeSummary(deterministicProbeResults);
  return {
    fallbackResults,
    fallbackSummary,
    deterministicProbeResults,
    deterministicProbeSummary,
  };
}

function buildEffectiveSummary({
  fallbackTriggered,
  summary,
  fallbackSummary,
  deterministicProbeSummary,
}) {
  const probeUsable = fallbackTriggered && deterministicProbeSummary?.output_observed_rate > 0;
  if (!fallbackTriggered) {
    return { effectiveSummary: { mode: 'live_cli', ...summary }, probeUsable };
  }
  const selected = probeUsable ? deterministicProbeSummary : fallbackSummary;
  return {
    effectiveSummary: {
      mode: probeUsable ? 'deterministic_subagent_probe' : 'hook_e2e_fallback',
      ...selected,
      live_timed_out_cases: summary.timed_out_cases,
      live_output_observed_rate: summary.output_observed_rate,
      hook_spawn_success_rate: fallbackSummary?.spawn_success_rate ?? 0,
      hook_evidence_injection_rate: fallbackSummary?.evidence_injection_rate ?? 0,
    },
    probeUsable,
  };
}

function assertStrictThresholdsIfEnabled({
  fallbackTriggered,
  probeUsable,
  summary,
  fallbackSummary,
  deterministicProbeSummary,
}) {
  if (!STRICT_THRESHOLDS) return;
  const strictSource = fallbackTriggered
    ? probeUsable
      ? deterministicProbeSummary
      : fallbackSummary
    : summary;
  assert.ok(strictSource.spawn_success_rate >= 0.66, 'spawn success rate below strict threshold');
  assert.ok(
    strictSource.evidence_injection_rate >= 0.33,
    'evidence injection rate below strict threshold'
  );
  assert.ok(strictSource.groundedness_rate >= 0.5, 'groundedness rate below strict threshold');
}

describe('live eval: subagent memory/rag usage', () => {
  it('runs live subagent eval and writes groundedness metrics report', { skip: !RUN_LIVE_EVALS }, async t => {
    const smoke = await runLiveCase(LIVE_SMOKE_CASE);
    if (!smoke.ok && /not recognized|not found|ENOENT/i.test(smoke.error || smoke.stderr || '')) {
      t.skip('claude CLI is not available in this environment');
      return;
    }

    const smokeShortCircuited = hasNoStreamSignal(smoke);
    const results = await collectLiveResults(smokeShortCircuited);

    const liveSummaryInput = smokeShortCircuited ? [smoke] : results;
    const summary = computeSummary(liveSummaryInput);
    const fallbackTriggered = smokeShortCircuited || shouldUseFallback(summary);
    const {
      fallbackResults,
      fallbackSummary,
      deterministicProbeResults,
      deterministicProbeSummary,
    } = await collectFallbackData(fallbackTriggered);
    const { effectiveSummary, probeUsable } = buildEffectiveSummary({
      fallbackTriggered,
      summary,
      fallbackSummary,
      deterministicProbeSummary,
    });

    const report = {
      generated_at: new Date().toISOString(),
      mode: fallbackTriggered ? 'dual_run' : 'live_subagent_runtime',
      model_runner: 'claude -p --output-format stream-json',
      strict_thresholds: STRICT_THRESHOLDS,
      summary: effectiveSummary,
      live_cli: {
        smoke,
        short_circuited: smokeShortCircuited,
        summary,
        cases: results,
      },
      hook_e2e_fallback: fallbackTriggered
        ? {
            summary: fallbackSummary,
            cases: fallbackResults,
          }
        : null,
      deterministic_subagent_probe: fallbackTriggered
        ? {
            summary: deterministicProbeSummary,
            cases: deterministicProbeResults,
          }
        : null,
    };

    ensureReportDir();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    assert.ok(fs.existsSync(REPORT_PATH), 'report should be written');
    if (!smokeShortCircuited) {
      assert.ok(results.length === EVAL_CASES.length, 'all eval cases should run');
    }

    assertStrictThresholdsIfEnabled({
      fallbackTriggered,
      probeUsable,
      summary,
      fallbackSummary,
      deterministicProbeSummary,
    });
  });
});
