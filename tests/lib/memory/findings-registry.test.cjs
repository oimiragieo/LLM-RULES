'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  OPEN_FINDINGS_FILE,
  extractFindingsFromMarkdown,
  ingestReportFindings,
  getOpenFindings,
  resolveFindingsFromCompletion,
  getFindingsSummary,
  extractResolutionEvidence,
  recordFindingsTrendSnapshot,
  summarizeFindingsTrend,
} = require('../../../.claude/lib/memory/findings-registry.cjs');

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'findings-registry-test-'));
}

function cleanup(projectRoot) {
  if (projectRoot && fs.existsSync(projectRoot)) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function withEnv(envMap, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(envMap)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function writeReport(projectRoot, relPath, content) {
  const absPath = path.join(projectRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
  return absPath;
}

test('extractFindingsFromMarkdown captures severity and summary lines from audit markdown', () => {
  const markdown = [
    '# Codebase Audit Summary',
    '',
    'P0 — Critical (Fix Now)',
    '1. Command injection bypass in shell-validators.cjs',
    '2. Unsafe JSON.parse in hook input parser',
    '',
    'P1 — High',
    '- Missing test coverage for routing guard',
  ].join('\n');

  const findings = extractFindingsFromMarkdown(markdown, {
    sourceReportPath: '.claude/context/reports/codebase-audit.md',
  });

  assert.equal(findings.length, 3);
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[0].summary.includes('Command injection'), true);
  assert.equal(findings[2].severity, 'high');
});

test('ingestReportFindings creates open-findings registry and deduplicates repeated ingestion', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-1.md');
    writeReport(
      root,
      reportRel,
      [
        '# Audit',
        'P0 — Critical',
        '1. Windows path bug in creator guard',
        'P1 — High',
        '1. Missing integration test around router-task handoff',
      ].join('\n')
    );

    const first = ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-123',
      agentType: 'code-reviewer',
    });
    assert.equal(first.added >= 2, true);

    const second = ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-123',
      agentType: 'code-reviewer',
    });
    assert.equal(second.added, 0);
    assert.equal(second.updated >= 2, true);

    const registryPath = path.join(root, OPEN_FINDINGS_FILE);
    assert.equal(fs.existsSync(registryPath), true);
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(Array.isArray(parsed.findings), true);
    assert.equal(parsed.findings.length, 2);
    assert.equal(parsed.findings.every(f => f.status === 'open'), true);
  } finally {
    cleanup(root);
  }
});

test('getOpenFindings returns priority-sorted unresolved items', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-2.md');
    writeReport(
      root,
      reportRel,
      [
        '# Audit',
        'P2 — Medium',
        '1. Could optimize report write path',
        'P0 — Critical',
        '1. Command injection via shell validator gap',
        'P1 — High',
        '1. Task update sequencing not enforced in prompt',
      ].join('\n')
    );

    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-456',
      agentType: 'architect',
    });

    const top = getOpenFindings(root, { limit: 2 });
    assert.equal(top.length, 2);
    assert.equal(top[0].severity, 'critical');
    assert.equal(top[1].severity, 'high');
  } finally {
    cleanup(root);
  }
});

test('resolveFindingsFromCompletion marks matching open findings as resolved when completion includes fix cues', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-3.md');
    writeReport(
      root,
      reportRel,
      ['# Audit', 'P0 — Critical', '1. Command injection gap in shell validator'].join('\n')
    );

    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-999',
      agentType: 'security-architect',
    });

    const result = resolveFindingsFromCompletion(
      root,
      'Implemented fix: patched shell validator command injection gap and added tests.',
      { taskId: 'task-1001', agentType: 'developer' }
    );
    assert.equal(result.resolved, 1);

    const open = getOpenFindings(root, { limit: 10 });
    assert.equal(open.length, 0);

    const registryPath = path.join(root, OPEN_FINDINGS_FILE);
    const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const resolvedFinding = payload.findings.find(f => f.status === 'resolved');
    assert.equal(Boolean(resolvedFinding), true);
    assert.equal(resolvedFinding.resolvedByTaskId, 'task-1001');
  } finally {
    cleanup(root);
  }
});

test('resolveFindingsFromCompletion stores resolution evidence for files and test commands', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-4.md');
    writeReport(
      root,
      reportRel,
      ['# Audit', 'P1 — High', '1. Task update sequencing regression in router flow'].join('\n')
    );

    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-111',
      agentType: 'qa',
    });

    const completionText = [
      'Fixed task update sequencing regression in router flow.',
      'Updated files: .claude/hooks/routing/pre-tool-unified.cjs tests/hooks/pre-tool-unified-taskupdate-first.test.cjs',
      'Validation: pnpm run test:memory:ci',
    ].join(' ');

    const result = resolveFindingsFromCompletion(root, completionText, {
      taskId: 'task-222',
      agentType: 'developer',
    });
    assert.equal(result.resolved, 1);

    const payload = JSON.parse(
      fs.readFileSync(path.join(root, OPEN_FINDINGS_FILE), 'utf8')
    );
    const resolved = payload.findings.find(f => f.status === 'resolved');
    assert.equal(Boolean(resolved), true);
    assert.equal(Array.isArray(resolved.resolutionEvidence.files), true);
    assert.equal(resolved.resolutionEvidence.files.length >= 1, true);
    assert.equal(Array.isArray(resolved.resolutionEvidence.commands), true);
    assert.equal(
      resolved.resolutionEvidence.commands.some(cmd => cmd.includes('test:memory:ci')),
      true
    );
  } finally {
    cleanup(root);
  }
});

test('getFindingsSummary reports open/resolved counts by severity', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-5.md');
    writeReport(
      root,
      reportRel,
      [
        '# Audit',
        'P0 — Critical',
        '1. Command injection bypass in shell validator',
        'P1 — High',
        '1. Task update sequencing regression in router flow',
      ].join('\n')
    );

    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-300',
      agentType: 'security-architect',
    });

    resolveFindingsFromCompletion(
      root,
      'Fixed command injection bypass in shell validator with tests',
      { taskId: 'task-301', agentType: 'developer' }
    );

    const summary = getFindingsSummary(root);
    assert.equal(summary.total >= 2, true);
    assert.equal(summary.open >= 1, true);
    assert.equal(summary.resolved >= 1, true);
    assert.equal(summary.bySeverity.critical.total >= 1, true);
    assert.equal(summary.bySeverity.high.total >= 1, true);
  } finally {
    cleanup(root);
  }
});

test('extractResolutionEvidence captures files and validation commands from completion text', () => {
  const evidence = extractResolutionEvidence(
    'Patched shell validator in .claude/hooks/safety/shell-injection-validator.cjs and verified with pnpm run test:framework and node --test tests/hooks/post-task-unified.test.cjs'
  );
  assert.equal(evidence.files.includes('.claude/hooks/safety/shell-injection-validator.cjs'), true);
  assert.equal(evidence.commands.some(cmd => cmd.includes('pnpm run test:framework')), true);
  assert.equal(
    evidence.commands.some(cmd => cmd.includes('node --test tests/hooks/post-task-unified.test.cjs')),
    true
  );
});

test('strict resolution mode does not auto-resolve without evidence', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-6.md');
    writeReport(
      root,
      reportRel,
      ['# Audit', 'P1 — High', '1. Task update sequencing regression in router flow'].join('\n')
    );
    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-901',
      agentType: 'qa',
    });

    const result = withEnv({ OPEN_FINDINGS_RESOLUTION_MODE: 'strict' }, () =>
      resolveFindingsFromCompletion(
        root,
        'Fixed task update sequencing regression in router flow.',
        { taskId: 'task-902', agentType: 'developer' }
      )
    );

    assert.equal(result.resolved, 0);
    assert.equal(getOpenFindings(root, { limit: 10 }).length, 1);
  } finally {
    cleanup(root);
  }
});

test('recordFindingsTrendSnapshot and summarizeFindingsTrend provide unresolved trend metrics', () => {
  const root = createTempProjectRoot();
  try {
    const reportRel = path.join('.claude', 'context', 'reports', 'codebase-audit-7.md');
    writeReport(
      root,
      reportRel,
      [
        '# Audit',
        'P0 — Critical',
        '1. Command injection bypass in shell validator',
        'P1 — High',
        '1. Task update sequencing regression in router flow',
      ].join('\n')
    );
    ingestReportFindings(root, path.join(root, reportRel), {
      taskId: 'task-950',
      agentType: 'security-architect',
    });

    const first = recordFindingsTrendSnapshot(root, 'test-initial');
    assert.equal(first.open >= 2, true);

    resolveFindingsFromCompletion(
      root,
      'Patched command injection bypass in shell validator. Verified via pnpm run test:memory:ci.',
      { taskId: 'task-951', agentType: 'developer' }
    );

    const second = recordFindingsTrendSnapshot(root, 'test-after-fix');
    assert.equal(second.open < first.open, true);

    const trend = summarizeFindingsTrend(root, { days: 7 });
    assert.equal(trend.sampleCount >= 2, true);
    assert.equal(typeof trend.openDelta, 'number');
  } finally {
    cleanup(root);
  }
});
