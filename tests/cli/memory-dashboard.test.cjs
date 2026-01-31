/**
 * Tests for Memory Stats Dashboard CLI
 * TDD Cycle: RED → GREEN → REFACTOR
 *
 * Test Categories:
 * 1. Dashboard Rendering (ASCII charts)
 * 2. Data Aggregation (per-agent stats)
 * 3. CLI Options (--json, --agent, --period)
 * 4. JSONL Parsing (token-usage, compression-stats, compression-triggers)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/memory-dashboard.cjs');
const TEST_DIR = path.join(PROJECT_ROOT, '.claude/context/test-memory-dashboard');

describe('Memory Dashboard CLI', () => {
  beforeEach(() => {
    // Create test directory with mock JSONL data
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Category 1: Module Loading', () => {
    it('should export required functions', () => {
      const dashboard = require(CLI_PATH);
      assert.ok(typeof dashboard.parseTokenUsage === 'function', 'should export parseTokenUsage');
      assert.ok(typeof dashboard.parseCompressionStats === 'function', 'should export parseCompressionStats');
      assert.ok(typeof dashboard.parseCompressionTriggers === 'function', 'should export parseCompressionTriggers');
      assert.ok(typeof dashboard.aggregatePerAgent === 'function', 'should export aggregatePerAgent');
      assert.ok(typeof dashboard.renderDashboard === 'function', 'should export renderDashboard');
      assert.ok(typeof dashboard.main === 'function', 'should export main function');
    });
  });

  describe('Category 2: JSONL Parsing', () => {
    it('should parse token-usage.jsonl correctly', () => {
      const tokenUsageLog = path.join(TEST_DIR, 'token-usage.jsonl');
      const entries = [
        { timestamp: '2026-01-30T10:00:00.000Z', eventType: 'spawn', agentId: 'researcher', tokens: 5000, reason: 'Agent spawn' },
        { timestamp: '2026-01-30T10:05:00.000Z', eventType: 'tool_result', agentId: 'researcher', tokens: 10000, reason: 'Read 10KB file' },
        { timestamp: '2026-01-30T10:10:00.000Z', eventType: 'spawn', agentId: 'developer', tokens: 3000, reason: 'Agent spawn' }
      ];
      fs.writeFileSync(tokenUsageLog, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

      const dashboard = require(CLI_PATH);
      const result = dashboard.parseTokenUsage(tokenUsageLog);

      assert.equal(result.length, 3, 'should parse 3 entries');
      assert.equal(result[0].agentId, 'researcher');
      assert.equal(result[0].tokens, 5000);
      assert.equal(result[1].tokens, 10000);
    });

    it('should parse compression-stats.jsonl correctly', () => {
      const compressionStatsLog = path.join(TEST_DIR, 'compression-stats.jsonl');
      const entries = [
        { timestamp: '2026-01-30T10:15:00.000Z', reason: 'Budget > 90%', urgency: 'high', bytesFreed: 35420, success: true },
        { timestamp: '2026-01-30T10:30:00.000Z', reason: 'Read > 10KB', urgency: 'medium', bytesFreed: 15000, success: true }
      ];
      fs.writeFileSync(compressionStatsLog, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

      const dashboard = require(CLI_PATH);
      const result = dashboard.parseCompressionStats(compressionStatsLog);

      assert.equal(result.length, 2, 'should parse 2 entries');
      assert.equal(result[0].urgency, 'high');
      assert.equal(result[1].bytesFreed, 15000);
    });

    it('should parse compression-triggers.jsonl correctly', () => {
      const compressionTriggersLog = path.join(TEST_DIR, 'compression-triggers.jsonl');
      const entries = [
        { timestamp: '2026-01-30T10:00:00.000Z', taskId: 'task-1', agentId: 'researcher', trigger: 'Read > 10KB (15KB)', urgency: 'medium', phase: 2 },
        { timestamp: '2026-01-30T10:20:00.000Z', taskId: 'task-2', agentId: 'developer', trigger: 'Budget > 90% (91.0%)', urgency: 'high', phase: 2 }
      ];
      fs.writeFileSync(compressionTriggersLog, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

      const dashboard = require(CLI_PATH);
      const result = dashboard.parseCompressionTriggers(compressionTriggersLog);

      assert.equal(result.length, 2, 'should parse 2 entries');
      assert.equal(result[0].urgency, 'medium');
      assert.equal(result[1].trigger, 'Budget > 90% (91.0%)');
    });

    it('should handle missing JSONL files gracefully', () => {
      const dashboard = require(CLI_PATH);
      const result = dashboard.parseTokenUsage('/nonexistent/path.jsonl');
      assert.deepEqual(result, [], 'should return empty array for missing file');
    });

    it('should handle malformed JSONL entries', () => {
      const tokenUsageLog = path.join(TEST_DIR, 'token-usage.jsonl');
      fs.writeFileSync(tokenUsageLog, 'invalid json\n{"valid": "entry"}\n', 'utf8');

      const dashboard = require(CLI_PATH);
      const result = dashboard.parseTokenUsage(tokenUsageLog);

      // Should skip invalid lines, parse valid ones
      assert.equal(result.length, 1, 'should skip invalid JSON');
    });
  });

  describe('Category 3: Data Aggregation', () => {
    it('should aggregate token usage per agent', () => {
      const tokenEvents = [
        { agentId: 'researcher', tokens: 5000 },
        { agentId: 'researcher', tokens: 10000 },
        { agentId: 'developer', tokens: 3000 },
        { agentId: 'developer', tokens: 2000 }
      ];

      const dashboard = require(CLI_PATH);
      const result = dashboard.aggregatePerAgent(tokenEvents);

      assert.equal(result.researcher.totalTokens, 15000);
      assert.equal(result.researcher.eventCount, 2);
      assert.equal(result.developer.totalTokens, 5000);
      assert.equal(result.developer.eventCount, 2);
    });

    it('should calculate compression count per agent', () => {
      const tokenEvents = [
        { agentId: 'researcher', tokens: 5000 },
        { agentId: 'researcher', tokens: 10000 }
      ];
      const compressionEvents = [
        { timestamp: '2026-01-30T10:00:00.000Z', reason: 'Budget > 90%', success: true }
      ];
      const compressionTriggers = [
        { agentId: 'researcher', urgency: 'high' },
        { agentId: 'researcher', urgency: 'medium' }
      ];

      const dashboard = require(CLI_PATH);
      const result = dashboard.aggregatePerAgent(tokenEvents, compressionTriggers);

      assert.equal(result.researcher.compressionCount, 2, 'should count compressions for researcher');
    });

    it('should calculate budget percentage', () => {
      const tokenEvents = [
        { agentId: 'researcher', tokens: 95000 }, // 47.5% of 200K budget
        { agentId: 'developer', tokens: 42000 }  // 21% of 200K budget
      ];

      const dashboard = require(CLI_PATH);
      const result = dashboard.aggregatePerAgent(tokenEvents);

      assert.ok(result.researcher.budgetPercent >= 47 && result.researcher.budgetPercent <= 48, 'researcher ~47.5%');
      assert.ok(result.developer.budgetPercent >= 21 && result.developer.budgetPercent <= 22, 'developer ~21%');
    });
  });

  describe('Category 4: Dashboard Rendering', () => {
    it('should render summary section', () => {
      const stats = {
        activeAgents: 3,
        avgTokenUsage: 45000,
        totalCompressions: 2,
        status: 'HEALTHY'
      };

      const dashboard = require(CLI_PATH);
      const output = dashboard.renderDashboard(stats);

      assert.ok(output.includes('OVERALL METRICS'), 'should include summary header');
      assert.ok(output.includes('Active Agents: 3'), 'should show agent count');
      assert.ok(output.includes('Avg Token Usage: 45,000'), 'should format token count');
      assert.ok(output.includes('Total Compressions: 2'), 'should show compression count');
      assert.ok(output.includes('HEALTHY'), 'should show status');
    });

    it('should render per-agent breakdown', () => {
      const agentStats = {
        researcher: { totalTokens: 95000, budget: 200000, budgetPercent: 47.5, compressionCount: 2, status: 'WARNING' },
        developer: { totalTokens: 42000, budget: 200000, budgetPercent: 21.0, compressionCount: 0, status: 'OK' }
      };

      const dashboard = require(CLI_PATH);
      const output = dashboard.renderDashboard({ agents: agentStats });

      assert.ok(output.includes('PER-AGENT BREAKDOWN'), 'should include agent section');
      assert.ok(output.includes('researcher'), 'should list researcher');
      assert.ok(output.includes('95,000 / 200,000'), 'should show token usage');
      assert.ok(output.includes('47.5%'), 'should show percentage');
      assert.ok(output.includes('WARNING'), 'should show status');
      assert.ok(output.includes('developer'), 'should list developer');
      assert.ok(output.includes('OK'), 'should show OK status');
    });

    it('should render compression timeline', () => {
      const compressionEvents = [
        { timestamp: '2026-01-30T14:35:00.000Z', reason: 'Budget > 90%', bytesFreed: 45000 },
        { timestamp: '2026-01-30T12:10:00.000Z', reason: 'Read > 10KB (10.5KB)', bytesFreed: 10500 }
      ];

      const dashboard = require(CLI_PATH);
      const output = dashboard.renderDashboard({ compressions: compressionEvents });

      assert.ok(output.includes('COMPRESSION TIMELINE'), 'should include timeline section');
      assert.ok(output.includes('Budget > 90%'), 'should show compression reason');
      assert.ok(output.includes('freed: 45 KB'), 'should show bytes freed');
    });

    it('should render alerts section', () => {
      const agentStats = {
        researcher: { totalTokens: 95000, budget: 200000, budgetPercent: 47.5, status: 'WARNING' }
      };

      const dashboard = require(CLI_PATH);
      const output = dashboard.renderDashboard({ agents: agentStats });

      assert.ok(output.includes('ALERTS'), 'should include alerts section');
      assert.ok(output.includes('researcher token usage at 47.5%'), 'should show alert detail');
    });

    it('should use Unicode box drawing characters', () => {
      const dashboard = require(CLI_PATH);
      const output = dashboard.renderDashboard({ activeAgents: 1 });

      // Check for Unicode box characters
      assert.ok(output.includes('╔') || output.includes('║') || output.includes('─') || output.includes('├'), 'should use Unicode box characters');
    });
  });

  describe('Category 5: CLI Options', () => {
    it('should support --json option', () => {
      const dashboard = require(CLI_PATH);
      const stats = { activeAgents: 2, avgTokenUsage: 30000 };
      const output = dashboard.main({ json: true, stats });

      const parsed = JSON.parse(output);
      assert.equal(parsed.activeAgents, 2);
      assert.equal(parsed.avgTokenUsage, 30000);
    });

    it('should support --agent filter', () => {
      const agentStats = {
        researcher: { totalTokens: 95000 },
        developer: { totalTokens: 42000 }
      };

      const dashboard = require(CLI_PATH);
      const output = dashboard.main({ agent: 'researcher', agents: agentStats });

      assert.ok(output.includes('researcher'), 'should show researcher');
      assert.ok(!output.includes('developer'), 'should not show developer');
    });

    it('should support --period filter', () => {
      const tokenEvents = [
        { timestamp: '2026-01-30T10:00:00.000Z', agentId: 'researcher', tokens: 5000 },
        { timestamp: '2026-01-23T10:00:00.000Z', agentId: 'researcher', tokens: 3000 } // 7 days ago
      ];

      const dashboard = require(CLI_PATH);
      const result = dashboard.main({ period: '7d', tokenEvents });

      // Should only include events from last 7 days
      assert.ok(result.includes('5000') || result.includes('5,000'), 'should include recent event');
    });

    it('should support --export option', () => {
      const exportPath = path.join(TEST_DIR, 'memory-report.txt');
      const dashboard = require(CLI_PATH);

      dashboard.main({ export: exportPath, activeAgents: 1 });

      assert.ok(fs.existsSync(exportPath), 'should create export file');
      const content = fs.readFileSync(exportPath, 'utf8');
      assert.ok(content.length > 0, 'export file should have content');
    });
  });

  describe('Category 6: Smoke Tests', () => {
    it('should run full dashboard without errors', () => {
      // Create minimal test data
      const tokenUsageLog = path.join(TEST_DIR, 'token-usage.jsonl');
      fs.writeFileSync(tokenUsageLog, JSON.stringify({
        timestamp: '2026-01-30T10:00:00.000Z',
        eventType: 'spawn',
        agentId: 'developer',
        tokens: 3000,
        reason: 'Agent spawn'
      }) + '\n', 'utf8');

      const dashboard = require(CLI_PATH);
      const output = dashboard.main({ contextDir: TEST_DIR });

      assert.ok(output.length > 100, 'should generate dashboard output');
      assert.ok(output.includes('MEMORY DASHBOARD'), 'should have dashboard title');
    });

    it('should handle empty data gracefully', () => {
      const dashboard = require(CLI_PATH);
      const output = dashboard.main({ contextDir: TEST_DIR });

      assert.ok(output.includes('MEMORY DASHBOARD'), 'should render even with no data');
      assert.ok(output.includes('Active Agents: 0'), 'should show zero agents');
    });

    it('should export valid JSON format', () => {
      const dashboard = require(CLI_PATH);
      const output = dashboard.main({ json: true, activeAgents: 1, avgTokenUsage: 10000 });

      assert.doesNotThrow(() => {
        JSON.parse(output);
      }, 'should produce valid JSON');
    });
  });
});
