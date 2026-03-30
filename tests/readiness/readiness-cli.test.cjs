'use strict';

/**
 * Tests for Readiness CLI
 *
 * Covers validation contract assertions:
 * - VAL-RR-001: CLI score command runs scorer and outputs formatted report
 * - VAL-RR-004: CLI remediate command invokes ReadinessRemediation, supports dry-run
 *
 * NOTE: ReadinessScorer and ReadinessRemediation are mocked with stub results
 * to avoid slow real scoring operations.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createReadinessCLI,
  runScore,
  runRemediate,
} = require('../../.claude/lib/readiness/readiness-cli.cjs');

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A mock readiness report with 6/9 pillars passing */
const MOCK_REPORT = {
  repoPath: path.join('C:', 'tmp', 'test-project'),
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'L3',
  overallScore: 72,
  pillars: {
    styleAndValidation: { score: 90, passed: true, weight: 1.0, command: '<mock>', exitCode: 0 },
    buildSystem: { score: 85, passed: true, weight: 1.0, command: '<mock>', exitCode: 0 },
    testing: { score: 40, passed: false, weight: 1.5, command: '<mock>', exitCode: 1 },
    documentation: { score: 50, passed: false, weight: 0.8, command: '<mock>', exitCode: 1 },
    developmentEnvironment: {
      score: 70,
      passed: false,
      weight: 0.8,
      command: '<mock>',
      exitCode: 1,
    },
    debuggingAndObservability: {
      score: 80,
      passed: true,
      weight: 1.0,
      command: '<mock>',
      exitCode: 0,
    },
    security: { score: 90, passed: true, weight: 1.2, command: '<mock>', exitCode: 0 },
    taskDiscovery: { score: 95, passed: true, weight: 0.7, command: '<mock>', exitCode: 0 },
    productAndExperimentation: {
      score: 85,
      passed: true,
      weight: 0.5,
      command: '<mock>',
      exitCode: 0,
    },
  },
  gateStatus: { passed: false, threshold: 80, details: 'Score 72 below threshold 80' },
  recommendations: ['Improve testing: Test framework and coverage. Current score: 40/100'],
};

/** A mock report with all pillars passing */
const MOCK_PASSING_REPORT = {
  ...MOCK_REPORT,
  level: 'L4',
  overallScore: 90,
  gateStatus: { passed: true, threshold: 80, details: 'Score 90 meets threshold 80' },
  pillars: Object.fromEntries(
    Object.entries(MOCK_REPORT.pillars).map(([k, v]) => [k, { ...v, passed: true, score: 90 }])
  ),
  recommendations: [],
};

// ─── Mock classes ─────────────────────────────────────────────────────────────

/** Stub ReadinessScorer that returns a fixed report */
class MockReadinessScorer {
  constructor(opts) {
    this.opts = opts;
  }

  score() {
    return MOCK_REPORT;
  }
}

/** Stub ReadinessScorer that returns all-passing report */
class MockPassingScorer {
  constructor(opts) {
    this.opts = opts;
  }

  score() {
    return MOCK_PASSING_REPORT;
  }
}

/** Stub ReportFormatter that returns known strings per format */
class MockReportFormatter {
  constructor(fmt) {
    this._fmt = fmt;
  }

  format(report) {
    if (this._fmt === 'json') return JSON.stringify(report);
    if (this._fmt === 'markdown')
      return `## Readiness Report\n| Pillar | Score | Status |\n|---|---|---|\n| styleAndValidation | 90/100 | ✅ PASS |`;
    if (this._fmt === 'summary') return `Readiness: ${report.level} (${report.overallScore}/100)`;
    // terminal
    return `terminal output level=${report.level} score=${report.overallScore}`;
  }
}

/** Stub ReadinessRemediation that returns a known result */
class MockReadinessRemediation {
  constructor(opts) {
    this.opts = opts;
  }

  remediate() {
    const dryRun = this.opts.dryRun === true;
    return {
      remediations: [
        {
          pillar: 'testing',
          status: dryRun ? 'planned' : 'completed',
          action: 'Create Jest configuration',
        },
        {
          pillar: 'documentation',
          status: dryRun ? 'planned' : 'completed',
          action: 'Create documentation files',
        },
        {
          pillar: 'developmentEnvironment',
          status: dryRun ? 'planned' : 'completed',
          action: 'Create devcontainer configuration',
        },
      ],
      plan: [
        'create: jest.config.js (testing)',
        'create: README.md (documentation)',
        'create: .devcontainer/devcontainer.json (developmentEnvironment)',
      ],
      summary: {
        total: 3,
        completed: dryRun ? 0 : 3,
        planned: dryRun ? 3 : 0,
        failed: 0,
      },
      gitAvailable: false,
      dryRun,
      fix: true,
      restoredBranch: null,
    };
  }
}

/** Stub ReadinessRemediation that returns no plan (all passing) */
class MockNoOpRemediation {
  constructor(opts) {
    this.opts = opts;
  }

  remediate() {
    return {
      remediations: [],
      plan: [],
      summary: { total: 0, completed: 0, planned: 0, failed: 0 },
      gitAvailable: false,
      dryRun: this.opts.dryRun,
      fix: true,
      restoredBranch: null,
    };
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Capture output from a function that writes via the _output hook */
function captureOutput(fn) {
  const chunks = [];
  fn(s => chunks.push(s));
  return chunks.join('');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('readiness-cli', () => {
  // ── createReadinessCLI ────────────────────────────────────────────────────
  describe('createReadinessCLI', () => {
    it('returns a Commander program', () => {
      const program = createReadinessCLI();
      assert.ok(program, 'program should be truthy');
      assert.equal(typeof program.parse, 'function', 'program.parse should be a function');
      assert.equal(typeof program.command, 'function', 'program.command should be a function');
    });

    it('has score, report, remediate, config commands', () => {
      const program = createReadinessCLI();
      const commandNames = program.commands.map(c => c.name());
      assert.ok(commandNames.includes('score'), 'should have score command');
      assert.ok(commandNames.includes('report'), 'should have report command');
      assert.ok(commandNames.includes('remediate'), 'should have remediate command');
      assert.ok(commandNames.includes('config'), 'should have config command');
    });

    it('score command has --format option', () => {
      const program = createReadinessCLI();
      const scoreCmd = program.commands.find(c => c.name() === 'score');
      assert.ok(scoreCmd, 'score command should exist');
      const options = scoreCmd.options.map(o => o.long);
      assert.ok(options.includes('--format'), 'score should have --format option');
    });

    it('score command has --dir option', () => {
      const program = createReadinessCLI();
      const scoreCmd = program.commands.find(c => c.name() === 'score');
      const options = scoreCmd.options.map(o => o.long);
      assert.ok(options.includes('--dir'), 'score should have --dir option');
    });

    it('remediate command has --dry-run option', () => {
      const program = createReadinessCLI();
      const remCmd = program.commands.find(c => c.name() === 'remediate');
      assert.ok(remCmd, 'remediate command should exist');
      const options = remCmd.options.map(o => o.long);
      assert.ok(options.includes('--dry-run'), 'remediate should have --dry-run option');
    });
  });

  // ── VAL-RR-001: runScore ──────────────────────────────────────────────────
  describe('VAL-RR-001: score command runs scorer and outputs report', () => {
    it('runScore calls ReadinessScorer and returns report', () => {
      let scorerInstantiated = false;
      class TrackingScorer extends MockReadinessScorer {
        constructor(opts) {
          super(opts);
          scorerInstantiated = true;
        }
      }

      const output = captureOutput(write => {
        const report = runScore(null, {
          _ReadinessScorer: TrackingScorer,
          _ReportFormatter: MockReportFormatter,
          _output: write,
        });
        assert.ok(report, 'runScore should return the report');
        assert.equal(report.level, 'L3', 'report.level should be L3');
        assert.equal(report.overallScore, 72, 'report.overallScore should be 72');
      });

      assert.ok(scorerInstantiated, 'ReadinessScorer should have been instantiated');
      assert.ok(output.length > 0, 'output should be non-empty');
    });

    it('default format is terminal with colored output', () => {
      const output = captureOutput(write => {
        runScore(null, {
          _ReadinessScorer: MockReadinessScorer,
          _ReportFormatter: MockReportFormatter,
          _output: write,
        });
      });

      assert.ok(output.includes('terminal output'), 'default format should use terminal');
      assert.ok(output.includes('level=L3'), 'output should include level');
    });

    it('--format json outputs valid JSON', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'json',
          _ReadinessScorer: MockReadinessScorer,
          _ReportFormatter: MockReportFormatter,
          _output: write,
        });
      });

      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(output.trim());
      }, 'output should be parseable JSON');
      assert.equal(parsed.level, 'L3', 'parsed JSON should have correct level');
      assert.equal(parsed.overallScore, 72, 'parsed JSON should have correct score');
    });

    it('--format markdown outputs markdown table', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'markdown',
          _ReadinessScorer: MockReadinessScorer,
          _ReportFormatter: MockReportFormatter,
          _output: write,
        });
      });

      assert.ok(output.includes('## Readiness Report'), 'markdown should have h2 header');
      assert.ok(output.includes('| Pillar |'), 'markdown should have table header');
      assert.ok(output.includes('|---|'), 'markdown should have table separator');
    });

    it('--format summary outputs single-line summary', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'summary',
          _ReadinessScorer: MockReadinessScorer,
          _ReportFormatter: MockReportFormatter,
          _output: write,
        });
      });

      // MockReportFormatter summary format: "Readiness: L3 (72/100)"
      assert.ok(output.includes('Readiness:'), 'summary should contain Readiness:');
      assert.ok(output.includes('L3'), 'summary should contain level');
      assert.ok(!output.includes('\n\n'), 'summary should be single-line (no blank lines)');
    });

    it('runScore uses real ReportFormatter when none injected (integration smoke)', () => {
      // We still inject MockReadinessScorer to avoid slow real scoring,
      // but let the real ReportFormatter format the output
      const output = captureOutput(write => {
        runScore(null, {
          format: 'summary',
          _ReadinessScorer: MockReadinessScorer,
          _output: write,
        });
      });

      assert.ok(output.includes('Readiness:'), 'should produce summary output');
      assert.ok(output.includes('/100'), 'should include score out of 100');
    });
  });

  // ── VAL-RR-001 via real formatter ─────────────────────────────────────────
  describe('VAL-RR-001: terminal format uses chalk colors', () => {
    it('terminal output contains ANSI escape codes', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'terminal',
          _ReadinessScorer: MockReadinessScorer,
          _output: write,
        });
      });

      // ANSI escape codes start with \x1b[
      assert.ok(output.includes('\x1b['), 'terminal output should include ANSI color codes');
    });

    it('terminal output includes level and score', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'terminal',
          _ReadinessScorer: MockReadinessScorer,
          _output: write,
        });
      });

      assert.ok(output.includes('L3'), 'terminal output should include level');
      assert.ok(output.includes('72'), 'terminal output should include score');
    });

    it('terminal output includes pillar names', () => {
      const output = captureOutput(write => {
        runScore(null, {
          format: 'terminal',
          _ReadinessScorer: MockReadinessScorer,
          _output: write,
        });
      });

      assert.ok(output.includes('styleAndValidation'), 'should list styleAndValidation pillar');
      assert.ok(output.includes('testing'), 'should list testing pillar');
    });
  });

  // ── VAL-RR-004: runRemediate ───────────────────────────────────────────────
  describe('VAL-RR-004: remediate command invokes ReadinessRemediation', () => {
    it('runRemediate calls ReadinessScorer and ReadinessRemediation', () => {
      let remediationInstantiated = false;
      class TrackingRemediation extends MockReadinessRemediation {
        constructor(opts) {
          super(opts);
          remediationInstantiated = true;
        }
      }

      captureOutput(write => {
        runRemediate(null, {
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: TrackingRemediation,
          _output: write,
        });
      });

      assert.ok(remediationInstantiated, 'ReadinessRemediation should have been instantiated');
    });

    it('runRemediate returns remediation result', () => {
      let result;
      captureOutput(write => {
        result = runRemediate(null, {
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: MockReadinessRemediation,
          _output: write,
        });
      });

      assert.ok(result, 'runRemediate should return result');
      assert.ok(result.summary, 'result should have summary');
      assert.equal(result.summary.total, 3, 'should have 3 remediations');
    });

    it('remediate output includes remediation plan', () => {
      const output = captureOutput(write => {
        runRemediate(null, {
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: MockReadinessRemediation,
          _output: write,
        });
      });

      assert.ok(output.includes('Remediation Plan'), 'output should mention Remediation Plan');
      assert.ok(output.includes('jest.config.js'), 'output should list planned files');
    });

    it('remediate output includes summary line', () => {
      const output = captureOutput(write => {
        runRemediate(null, {
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: MockReadinessRemediation,
          _output: write,
        });
      });

      assert.ok(output.includes('Summary:'), 'output should include Summary:');
      assert.ok(output.includes('completed'), 'output should mention completed count');
    });
  });

  // ── VAL-RR-004: dry-run ───────────────────────────────────────────────────
  describe('VAL-RR-004: --dry-run reports without writing files', () => {
    it('dry-run output mentions dry run mode', () => {
      const output = captureOutput(write => {
        runRemediate(null, {
          dryRun: true,
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: MockReadinessRemediation,
          _output: write,
        });
      });

      assert.ok(output.toLowerCase().includes('dry run'), 'output should mention dry run mode');
    });

    it('dry-run passes dryRun:true to ReadinessRemediation', () => {
      let capturedDryRun = null;
      class SpyRemediation extends MockReadinessRemediation {
        constructor(opts) {
          super(opts);
          capturedDryRun = opts.dryRun;
        }
      }

      captureOutput(write => {
        runRemediate(null, {
          dryRun: true,
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: SpyRemediation,
          _output: write,
        });
      });

      assert.equal(capturedDryRun, true, 'dryRun should be passed as true to ReadinessRemediation');
    });

    it('non-dry-run passes dryRun:false to ReadinessRemediation', () => {
      let capturedDryRun = null;
      class SpyRemediation extends MockReadinessRemediation {
        constructor(opts) {
          super(opts);
          capturedDryRun = opts.dryRun;
        }
      }

      captureOutput(write => {
        runRemediate(null, {
          dryRun: false,
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: SpyRemediation,
          _output: write,
        });
      });

      assert.equal(
        capturedDryRun,
        false,
        'dryRun should be passed as false to ReadinessRemediation'
      );
    });

    it('dry-run result has planned status (not completed)', () => {
      let result;
      captureOutput(write => {
        result = runRemediate(null, {
          dryRun: true,
          _ReadinessScorer: MockReadinessScorer,
          _ReadinessRemediation: MockReadinessRemediation,
          _output: write,
        });
      });

      assert.equal(result.summary.planned, 3, 'dry-run should show 3 planned');
      assert.equal(result.summary.completed, 0, 'dry-run should show 0 completed');
    });
  });

  // ── All pillars passing ───────────────────────────────────────────────────
  describe('remediate when all pillars pass', () => {
    it('outputs no remediation needed message', () => {
      const output = captureOutput(write => {
        runRemediate(null, {
          _ReadinessScorer: MockPassingScorer,
          _ReadinessRemediation: MockNoOpRemediation,
          _output: write,
        });
      });

      assert.ok(
        output.includes('No remediation needed'),
        'should say no remediation needed when all pass'
      );
    });
  });

  // ── Programmatic exports ──────────────────────────────────────────────────
  describe('programmatic exports', () => {
    it('runScore is exported as a function', () => {
      assert.equal(typeof runScore, 'function', 'runScore should be a function');
    });

    it('runRemediate is exported as a function', () => {
      assert.equal(typeof runRemediate, 'function', 'runRemediate should be a function');
    });

    it('createReadinessCLI is exported as a function', () => {
      assert.equal(
        typeof createReadinessCLI,
        'function',
        'createReadinessCLI should be a function'
      );
    });

    it('runScore works programmatically with injected deps', () => {
      const reports = [];
      const report = runScore(null, {
        format: 'json',
        _ReadinessScorer: MockReadinessScorer,
        _ReportFormatter: MockReportFormatter,
        _output: s => reports.push(s),
      });

      assert.ok(report, 'should return report');
      assert.equal(report.level, 'L3');
      assert.equal(reports.length, 1, 'should have written one chunk');
    });

    it('runRemediate works programmatically with injected deps', () => {
      const outputs = [];
      const result = runRemediate(null, {
        _ReadinessScorer: MockReadinessScorer,
        _ReadinessRemediation: MockReadinessRemediation,
        _output: s => outputs.push(s),
      });

      assert.ok(result, 'should return result');
      assert.equal(result.summary.total, 3);
      assert.ok(outputs.length > 0, 'should have written output');
    });
  });

  // ── ReportFormatter integration ───────────────────────────────────────────
  describe('report command uses markdown format', () => {
    it('report command (via createReadinessCLI) uses markdown format', () => {
      // Verify report command defaults to markdown by checking its description
      const program = createReadinessCLI();
      const reportCmd = program.commands.find(c => c.name() === 'report');
      assert.ok(reportCmd, 'report command should exist');
      assert.ok(
        reportCmd.description().toLowerCase().includes('markdown'),
        'report command description should mention markdown'
      );
    });
  });
});
