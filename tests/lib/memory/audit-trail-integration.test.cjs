#!/usr/bin/env node
/**
 * Audit Trail Integration Tests
 * ==============================
 *
 * TDD tests for audit-trail-integration.cjs (ADR-075 Phase 4B)
 *
 * Tests cover:
 * - Model selection event logging
 * - Cost calculation and difference
 * - TaskUpdate metadata generation
 * - Drift report generation
 * - Alert threshold checking
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const {
  logModelSelection,
  getTaskUpdateMetadata,
  generateDriftReport,
  parseAuditLog,
  checkDriftAlert,
  getModelCost,
  calculateCostDifference,
  getComplexity,
  rotateAuditLogs,
  getAuditLogPath,
  MODEL_COSTS,
  DEFAULT_TOKENS_PER_SPAWN,
} = require('../../../.claude/lib/memory/audit-trail-integration.cjs');

// Test fixtures
const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__dirname)));
const TEST_LOG_DIR = path.join(PROJECT_ROOT, '.claude/context/artifacts/audit-logs');
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, 'model-selection-audit.log');
const TEST_REPORT_DIR = path.join(PROJECT_ROOT, '.claude/context/artifacts/reports');

describe('audit-trail-integration', () => {
  describe('MODEL_COSTS', () => {
    it('should have cost data for opus', () => {
      const cost = MODEL_COSTS['claude-opus-4-5-20251101'];
      assert.ok(cost, 'Should have opus cost data');
      assert.ok(cost.input > 0, 'Input cost should be positive');
      assert.ok(cost.output > 0, 'Output cost should be positive');
      assert.strictEqual(cost.shorthand, 'opus');
    });

    it('should have cost data for sonnet', () => {
      const cost = MODEL_COSTS['claude-sonnet-4-5'];
      assert.ok(cost, 'Should have sonnet cost data');
      assert.ok(cost.input > 0, 'Input cost should be positive');
      assert.ok(cost.output > 0, 'Output cost should be positive');
      assert.strictEqual(cost.shorthand, 'sonnet');
    });

    it('should have cost data for haiku', () => {
      const cost = MODEL_COSTS['claude-haiku-4-5'];
      assert.ok(cost, 'Should have haiku cost data');
      assert.ok(cost.input > 0, 'Input cost should be positive');
      assert.ok(cost.output > 0, 'Output cost should be positive');
      assert.strictEqual(cost.shorthand, 'haiku');
    });

    it('should have opus > sonnet > haiku cost ordering', () => {
      const opus = MODEL_COSTS['claude-opus-4-5-20251101'];
      const sonnet = MODEL_COSTS['claude-sonnet-4-5'];
      const haiku = MODEL_COSTS['claude-haiku-4-5'];

      assert.ok(opus.input > sonnet.input, 'Opus input should be more expensive than sonnet');
      assert.ok(sonnet.input > haiku.input, 'Sonnet input should be more expensive than haiku');
      assert.ok(opus.output > sonnet.output, 'Opus output should be more expensive than sonnet');
      assert.ok(sonnet.output > haiku.output, 'Sonnet output should be more expensive than haiku');
    });
  });

  describe('getModelCost', () => {
    it('should return cost for full model ID', () => {
      const cost = getModelCost('claude-opus-4-5-20251101');
      assert.ok(cost);
      assert.strictEqual(cost.shorthand, 'opus');
    });

    it('should return cost for shorthand', () => {
      const cost = getModelCost('opus');
      assert.ok(cost);
      assert.ok(cost.fullId, 'Should include fullId when looking up by shorthand');
    });

    it('should return null for unknown model', () => {
      const cost = getModelCost('unknown-model');
      assert.strictEqual(cost, null);
    });
  });

  describe('calculateCostDifference', () => {
    it('should return positive when actual is more expensive', () => {
      // Using opus when sonnet was configured = more expensive
      const diff = calculateCostDifference('sonnet', 'opus');
      assert.ok(diff > 0, 'Opus should be more expensive than sonnet');
    });

    it('should return negative when actual is cheaper', () => {
      // Using haiku when sonnet was configured = cheaper
      const diff = calculateCostDifference('sonnet', 'haiku');
      assert.ok(diff < 0, 'Haiku should be cheaper than sonnet');
    });

    it('should return zero when models are the same', () => {
      const diff = calculateCostDifference('opus', 'opus');
      assert.strictEqual(diff, 0);
    });

    it('should return null for unknown models', () => {
      const diff = calculateCostDifference('unknown', 'opus');
      assert.strictEqual(diff, null);
    });

    it('should calculate based on provided token counts', () => {
      const tokens = { input: 100000, output: 20000 };
      const diff1 = calculateCostDifference('sonnet', 'opus', tokens);
      const diff2 = calculateCostDifference('sonnet', 'opus', DEFAULT_TOKENS_PER_SPAWN);

      // Different token counts should give different results
      assert.notStrictEqual(diff1, diff2);
    });
  });

  describe('getComplexity', () => {
    it('should return high for planner', () => {
      assert.strictEqual(getComplexity('planner'), 'high');
    });

    it('should return high for architect', () => {
      assert.strictEqual(getComplexity('architect'), 'high');
    });

    it('should return high for qa', () => {
      assert.strictEqual(getComplexity('qa'), 'high');
    });

    it('should return high for security-architect', () => {
      assert.strictEqual(getComplexity('security-architect'), 'high');
    });

    it('should return high for orchestrators', () => {
      assert.strictEqual(getComplexity('evolution-orchestrator'), 'high');
      assert.strictEqual(getComplexity('master-orchestrator'), 'high');
      assert.strictEqual(getComplexity('party-orchestrator'), 'high');
    });

    it('should return low for context-compressor', () => {
      assert.strictEqual(getComplexity('context-compressor'), 'low');
    });

    it('should return medium for developer', () => {
      assert.strictEqual(getComplexity('developer'), 'medium');
    });

    it('should return medium for unknown agents', () => {
      assert.strictEqual(getComplexity('unknown-agent'), 'medium');
    });
  });

  describe('getTaskUpdateMetadata', () => {
    it('should generate metadata from resolution object', () => {
      const resolution = {
        model: 'claude-opus-4-5-20251101',
        shorthand: 'opus',
        source: 'config.yaml',
      };

      const metadata = getTaskUpdateMetadata(resolution);

      assert.strictEqual(metadata.modelResolutionSource, 'config.yaml');
      assert.strictEqual(metadata.configuredModel, 'claude-opus-4-5-20251101');
      assert.strictEqual(metadata.actualModel, 'claude-opus-4-5-20251101');
      assert.strictEqual(metadata.modelMismatch, false);
      assert.strictEqual(metadata.modelShorthand, 'opus');
    });

    it('should detect mismatch when actual differs', () => {
      const resolution = {
        model: 'claude-opus-4-5-20251101',
        shorthand: 'opus',
        source: 'config.yaml',
      };

      const metadata = getTaskUpdateMetadata(resolution, 'claude-sonnet-4-5');

      assert.strictEqual(metadata.configuredModel, 'claude-opus-4-5-20251101');
      assert.strictEqual(metadata.actualModel, 'claude-sonnet-4-5');
      assert.strictEqual(metadata.modelMismatch, true);
    });
  });

  describe('logModelSelection', () => {
    let originalStderr;
    let stderrOutput;

    beforeEach(() => {
      stderrOutput = '';
      originalStderr = process.stderr.write;
      process.stderr.write = chunk => {
        stderrOutput += chunk;
        return true;
      };
    });

    afterEach(() => {
      process.stderr.write = originalStderr;
    });

    it('should log event to stderr', () => {
      logModelSelection('planner', 'opus', 'opus', 'config.yaml', { projectRoot: PROJECT_ROOT });

      assert.ok(stderrOutput.includes('ConfigModelSelection'), 'Should include event type');
      assert.ok(stderrOutput.includes('planner'), 'Should include agent_id');
    });

    it('should return complete event object', () => {
      const event = logModelSelection('planner', 'opus', 'sonnet', 'config.yaml', {
        projectRoot: PROJECT_ROOT,
      });

      assert.strictEqual(event.event, 'ConfigModelSelection');
      assert.strictEqual(event.agent_id, 'planner');
      assert.strictEqual(event.configured_model, 'opus');
      assert.strictEqual(event.actual_model, 'sonnet');
      assert.strictEqual(event.source, 'config.yaml');
      assert.strictEqual(event.mismatch, true);
      assert.ok(event.timestamp);
      assert.ok(event.cost_difference !== null);
    });

    it('should set mismatch false when models match', () => {
      const event = logModelSelection('developer', 'sonnet', 'sonnet', 'config.yaml', {
        projectRoot: PROJECT_ROOT,
      });

      assert.strictEqual(event.mismatch, false);
      assert.strictEqual(event.cost_difference, null);
    });

    it('should include complexity in event', () => {
      const event = logModelSelection('planner', 'opus', 'opus', 'config.yaml', {
        projectRoot: PROJECT_ROOT,
      });
      assert.strictEqual(event.complexity, 'high');

      const event2 = logModelSelection('developer', 'sonnet', 'sonnet', 'config.yaml', {
        projectRoot: PROJECT_ROOT,
      });
      assert.strictEqual(event2.complexity, 'medium');
    });
  });

  describe('parseAuditLog', () => {
    beforeEach(() => {
      // Ensure clean state
      if (fs.existsSync(TEST_LOG_FILE)) {
        fs.unlinkSync(TEST_LOG_FILE);
      }
    });

    it('should return empty array when log does not exist', () => {
      const events = parseAuditLog('/nonexistent/path');
      assert.deepStrictEqual(events, []);
    });

    it('should parse valid log entries', () => {
      // Create test log
      if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      }

      const testEvent = {
        event: 'ConfigModelSelection',
        timestamp: new Date().toISOString(),
        agent_id: 'planner',
        configured_model: 'opus',
        actual_model: 'sonnet',
        mismatch: true,
      };

      fs.writeFileSync(TEST_LOG_FILE, JSON.stringify(testEvent) + '\n');

      const events = parseAuditLog(PROJECT_ROOT);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].agent_id, 'planner');
    });

    it('should skip non-ConfigModelSelection events', () => {
      if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      }

      const lines =
        [
          JSON.stringify({ event: 'ConfigModelSelection', agent_id: 'planner' }),
          JSON.stringify({ event: 'OtherEvent', agent_id: 'developer' }),
        ].join('\n') + '\n';

      fs.writeFileSync(TEST_LOG_FILE, lines);

      const events = parseAuditLog(PROJECT_ROOT);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].agent_id, 'planner');
    });
  });

  describe('generateDriftReport', () => {
    beforeEach(() => {
      // Ensure clean state
      if (fs.existsSync(TEST_LOG_FILE)) {
        fs.unlinkSync(TEST_LOG_FILE);
      }
      if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      }
    });

    it('should generate empty report when no events', () => {
      const report = generateDriftReport({ projectRoot: PROJECT_ROOT });

      assert.strictEqual(report.summary.totalSpawns, 0);
      assert.strictEqual(report.summary.mismatches, 0);
      assert.strictEqual(report.summary.mismatchRate, '0%');
    });

    it('should calculate mismatch rate', () => {
      const today = new Date().toISOString().split('T')[0];

      const events = [
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T10:00:00Z`,
          agent_id: 'planner',
          mismatch: true,
        },
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T11:00:00Z`,
          agent_id: 'developer',
          mismatch: false,
        },
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T12:00:00Z`,
          agent_id: 'qa',
          mismatch: false,
        },
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T13:00:00Z`,
          agent_id: 'architect',
          mismatch: true,
        },
      ];

      fs.writeFileSync(TEST_LOG_FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n');

      const report = generateDriftReport({ projectRoot: PROJECT_ROOT });

      assert.strictEqual(report.summary.totalSpawns, 4);
      assert.strictEqual(report.summary.mismatches, 2);
      assert.strictEqual(report.summary.mismatchRate, '50.00%');
    });

    it('should aggregate stats by agent', () => {
      const today = new Date().toISOString().split('T')[0];

      const events = [
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T10:00:00Z`,
          agent_id: 'planner',
          configured_model: 'opus',
          source: 'config.yaml',
          mismatch: false,
        },
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T11:00:00Z`,
          agent_id: 'planner',
          configured_model: 'opus',
          source: 'config.yaml',
          mismatch: true,
        },
        {
          event: 'ConfigModelSelection',
          timestamp: `${today}T12:00:00Z`,
          agent_id: 'developer',
          configured_model: 'sonnet',
          source: 'frontmatter',
          mismatch: false,
        },
      ];

      fs.writeFileSync(TEST_LOG_FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n');

      const report = generateDriftReport({ projectRoot: PROJECT_ROOT });

      assert.ok(report.byAgent.planner);
      assert.strictEqual(report.byAgent.planner.spawns, 2);
      assert.strictEqual(report.byAgent.planner.mismatches, 1);

      assert.ok(report.byAgent.developer);
      assert.strictEqual(report.byAgent.developer.spawns, 1);
      assert.strictEqual(report.byAgent.developer.mismatches, 0);
    });

    it('should save report to file', () => {
      generateDriftReport({ projectRoot: PROJECT_ROOT });

      const today = new Date().toISOString().split('T')[0];
      const reportPath = path.join(TEST_REPORT_DIR, `model-selection-drift-${today}.json`);

      assert.ok(fs.existsSync(reportPath), 'Report file should be created');
    });
  });

  describe('checkDriftAlert', () => {
    beforeEach(() => {
      if (fs.existsSync(TEST_LOG_FILE)) {
        fs.unlinkSync(TEST_LOG_FILE);
      }
      if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      }
    });

    it('should not trigger alert when cost within threshold', () => {
      const result = checkDriftAlert({ projectRoot: PROJECT_ROOT, threshold: 10 });

      assert.strictEqual(result.triggered, false);
      assert.ok(result.message.includes('within acceptable'));
    });

    it('should include threshold in result', () => {
      const result = checkDriftAlert({ projectRoot: PROJECT_ROOT, threshold: 5 });

      assert.strictEqual(result.threshold, '$5.00');
    });
  });

  describe('getAuditLogPath', () => {
    it('should return correct path for project root', () => {
      const logPath = getAuditLogPath(PROJECT_ROOT);

      // Use path.sep for cross-platform compatibility
      assert.ok(
        logPath.includes('.claude') && logPath.includes('audit-logs'),
        `Log path should contain .claude and audit-logs: ${logPath}`
      );
      assert.ok(logPath.endsWith('model-selection-audit.log'));
    });
  });

  describe('rotateAuditLogs', () => {
    beforeEach(() => {
      if (fs.existsSync(TEST_LOG_FILE)) {
        fs.unlinkSync(TEST_LOG_FILE);
      }
      if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      }
    });

    it('should keep recent entries', () => {
      const today = new Date().toISOString();
      const events = [{ event: 'ConfigModelSelection', timestamp: today, agent_id: 'planner' }];

      fs.writeFileSync(TEST_LOG_FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n');

      rotateAuditLogs({ projectRoot: PROJECT_ROOT, keepDays: 30 });

      const content = fs.readFileSync(TEST_LOG_FILE, 'utf-8');
      assert.ok(content.includes('planner'), 'Recent entry should be kept');
    });

    it('should remove old entries', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      const events = [
        { event: 'ConfigModelSelection', timestamp: oldDate.toISOString(), agent_id: 'old-agent' },
      ];

      fs.writeFileSync(TEST_LOG_FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n');

      rotateAuditLogs({ projectRoot: PROJECT_ROOT, keepDays: 30 });

      const content = fs.readFileSync(TEST_LOG_FILE, 'utf-8');
      assert.ok(!content.includes('old-agent'), 'Old entry should be removed');
    });
  });
});
