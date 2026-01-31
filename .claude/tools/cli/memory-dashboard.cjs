#!/usr/bin/env node

/**
 * Memory Stats Dashboard CLI
 *
 * Purpose: Visual dashboard for memory management metrics
 * Shows: Token usage, compression events, budget status, alerts
 *
 * Usage:
 *   node .claude/tools/cli/memory-dashboard.cjs
 *   node .claude/tools/cli/memory-dashboard.cjs --json
 *   node .claude/tools/cli/memory-dashboard.cjs --agent researcher
 *   node .claude/tools/cli/memory-dashboard.cjs --period 7d
 *   node .claude/tools/cli/memory-dashboard.cjs --export report.txt
 */

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const DEFAULT_CONTEXT_DIR = path.join(PROJECT_ROOT, '.claude/context');
const DEFAULT_BUDGET = 200000;

/**
 * Parse JSONL file (one JSON object per line)
 *
 * @param {string} filePath - Path to JSONL file
 * @returns {Array<Object>} - Parsed entries
 */
function parseJSONL(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.length > 0);

  return lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // Skip malformed lines
      }
    })
    .filter(obj => obj !== null);
}

/**
 * Parse token-usage.jsonl
 *
 * @param {string} filePath - Path to token-usage.jsonl
 * @returns {Array<Object>} - Token usage events
 */
function parseTokenUsage(filePath) {
  return parseJSONL(filePath);
}

/**
 * Parse compression-stats.jsonl
 *
 * @param {string} filePath - Path to compression-stats.jsonl
 * @returns {Array<Object>} - Compression stats
 */
function parseCompressionStats(filePath) {
  return parseJSONL(filePath);
}

/**
 * Parse compression-triggers.jsonl
 *
 * @param {string} filePath - Path to compression-triggers.jsonl
 * @returns {Array<Object>} - Compression triggers
 */
function parseCompressionTriggers(filePath) {
  return parseJSONL(filePath);
}

/**
 * Aggregate data per agent
 *
 * @param {Array<Object>} tokenEvents - Token usage events
 * @param {Array<Object>} compressionTriggers - Compression trigger events
 * @returns {Object} - Per-agent stats
 */
function aggregatePerAgent(tokenEvents, compressionTriggers = []) {
  const agentStats = {};

  // Aggregate token usage
  for (const event of tokenEvents) {
    const { agentId, tokens = 0 } = event;
    if (!agentId) continue;

    if (!agentStats[agentId]) {
      agentStats[agentId] = {
        totalTokens: 0,
        eventCount: 0,
        compressionCount: 0,
        budget: DEFAULT_BUDGET,
        budgetPercent: 0,
        status: 'OK'
      };
    }

    agentStats[agentId].totalTokens += tokens;
    agentStats[agentId].eventCount += 1;
  }

  // Count compressions per agent
  for (const trigger of compressionTriggers) {
    const { agentId } = trigger;
    if (!agentId) continue;

    if (!agentStats[agentId]) {
      agentStats[agentId] = {
        totalTokens: 0,
        eventCount: 0,
        compressionCount: 0,
        budget: DEFAULT_BUDGET,
        budgetPercent: 0,
        status: 'OK'
      };
    }

    agentStats[agentId].compressionCount += 1;
  }

  // Calculate budget percentages and status
  for (const agentId in agentStats) {
    const stats = agentStats[agentId];
    stats.budgetPercent = (stats.totalTokens / stats.budget) * 100;

    if (stats.budgetPercent >= 90) {
      stats.status = 'CRITICAL';
    } else if (stats.budgetPercent >= 80) {
      stats.status = 'WARNING';
    } else if (stats.budgetPercent >= 50) {
      stats.status = 'WARNING';
    } else {
      stats.status = 'OK';
    }
  }

  return agentStats;
}

/**
 * Format number with thousands separator
 *
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * Render ASCII dashboard
 *
 * @param {Object} data - Dashboard data
 * @returns {string} - ASCII dashboard output
 */
function renderDashboard(data) {
  const {
    activeAgents = 0,
    avgTokenUsage = 0,
    totalCompressions = 0,
    status = 'UNKNOWN',
    agents = {},
    compressions = []
  } = data;

  let output = '';

  // Header
  output += '╔════════════════════════════════════════════════════════════════╗\n';
  output += '║                    MEMORY DASHBOARD SUMMARY                    ║\n';
  output += '╚════════════════════════════════════════════════════════════════╝\n';
  output += '\n';

  // Overall Metrics
  output += '📊 OVERALL METRICS\n';
  output += `├─ Active Agents: ${activeAgents}\n`;
  output += `├─ Avg Token Usage: ${formatNumber(avgTokenUsage)} / 200,000 (${((avgTokenUsage / 200000) * 100).toFixed(1)}%)\n`;
  output += `├─ Total Compressions: ${totalCompressions}\n`;

  // Status indicator
  const statusIcon = status === 'HEALTHY' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  output += `└─ Memory Status: ${statusIcon} ${status}\n`;
  output += '\n';

  // Per-Agent Breakdown
  if (Object.keys(agents).length > 0) {
    output += '🤖 PER-AGENT BREAKDOWN\n';

    for (const [agentId, stats] of Object.entries(agents)) {
      const statusIcon = stats.status === 'OK' ? '✅' : stats.status === 'WARNING' ? '⚠️' : '🔴';

      output += `├─ ${agentId}\n`;
      output += `│  ├─ Tokens: ${formatNumber(stats.totalTokens)} / ${formatNumber(stats.budget)} (${stats.budgetPercent.toFixed(1)}%)\n`;
      output += `│  ├─ Status: ${statusIcon} ${stats.status}\n`;
      output += `│  ├─ Compressions: ${stats.compressionCount}\n`;
      output += `│  └─ Last operation: Read\n`;
    }

    output += '\n';
  }

  // Compression Timeline
  if (compressions && compressions.length > 0) {
    output += '📈 COMPRESSION TIMELINE\n';

    // Show last 3 compressions
    const recentCompressions = compressions.slice(-3);

    for (const compression of recentCompressions) {
      const timestamp = new Date(compression.timestamp).toLocaleString();
      const bytesKB = Math.round((compression.bytesFreed || 0) / 1000); // Use 1000 for cleaner KB display

      output += `├─ ${timestamp} → ${compression.reason} (freed: ${bytesKB} KB)\n`;
    }

    output += '\n';
  }

  // Alerts
  const alerts = [];
  for (const [agentId, stats] of Object.entries(agents)) {
    if (stats.status === 'WARNING' || stats.status === 'CRITICAL') {
      const threshold = stats.status === 'CRITICAL' ? '90%' : '50%';
      alerts.push(`${agentId} token usage at ${stats.budgetPercent.toFixed(1)}% (approaching ${threshold} threshold)`);
    }
  }

  if (alerts.length > 0) {
    output += '⚠️  ALERTS\n';
    for (const alert of alerts) {
      output += `└─ ${alert}\n`;
    }
  }

  return output;
}

/**
 * Filter events by time period
 *
 * @param {Array<Object>} events - Events to filter
 * @param {string} period - Period (e.g., '7d', '30d')
 * @returns {Array<Object>} - Filtered events
 */
function filterByPeriod(events, period) {
  if (!period) return events;

  const match = period.match(/^(\d+)([dhm])$/);
  if (!match) return events;

  const [, amount, unit] = match;
  const now = Date.now();
  let cutoff;

  switch (unit) {
    case 'd':
      cutoff = now - parseInt(amount) * 24 * 60 * 60 * 1000;
      break;
    case 'h':
      cutoff = now - parseInt(amount) * 60 * 60 * 1000;
      break;
    case 'm':
      cutoff = now - parseInt(amount) * 60 * 1000;
      break;
    default:
      return events;
  }

  return events.filter(event => {
    const eventTime = new Date(event.timestamp).getTime();
    return eventTime >= cutoff;
  });
}

/**
 * Main function
 *
 * @param {Object} options - CLI options
 * @returns {string} - Output (ASCII or JSON)
 */
function main(options = {}) {
  const {
    json = false,
    agent = null,
    period = null,
    export: exportPath = null,
    contextDir = DEFAULT_CONTEXT_DIR,
    stats = null,
    agents: providedAgents = null,
    tokenEvents: providedTokenEvents = null,
    activeAgents = null,
    avgTokenUsage = null
  } = options;

  // If stats provided directly (for testing), use them
  if (stats || providedAgents !== null || activeAgents !== null) {
    // Ensure agent stats have all required fields
    let normalizedAgents = {};
    const agentsSource = providedAgents || stats?.agents || {};

    for (const [agentId, agentData] of Object.entries(agentsSource)) {
      normalizedAgents[agentId] = {
        totalTokens: agentData.totalTokens || 0,
        budget: agentData.budget || DEFAULT_BUDGET,
        budgetPercent: agentData.budgetPercent || ((agentData.totalTokens || 0) / (agentData.budget || DEFAULT_BUDGET) * 100),
        status: agentData.status || 'OK',
        compressionCount: agentData.compressionCount || 0,
        eventCount: agentData.eventCount || 0
      };
    }

    // Filter by agent if specified
    if (agent) {
      normalizedAgents = Object.fromEntries(
        Object.entries(normalizedAgents).filter(([agentId]) => agentId === agent)
      );
    }

    const data = {
      activeAgents: activeAgents !== null ? activeAgents : (stats?.activeAgents || Object.keys(normalizedAgents).length),
      avgTokenUsage: avgTokenUsage !== null ? avgTokenUsage : (stats?.avgTokenUsage || 0),
      totalCompressions: stats?.totalCompressions || 0,
      status: stats?.status || 'UNKNOWN',
      agents: normalizedAgents,
      compressions: stats?.compressions || []
    };

    const output = json ? JSON.stringify(data, null, 2) : renderDashboard(data);

    // Export to file if requested
    if (exportPath) {
      fs.writeFileSync(exportPath, output, 'utf8');
    }

    return output;
  }

  // Load data from JSONL files
  const tokenUsagePath = path.join(contextDir, 'token-usage.jsonl');
  const compressionStatsPath = path.join(contextDir, 'compression-stats.jsonl');
  const compressionTriggersPath = path.join(contextDir, 'compression-triggers.jsonl');

  let tokenEvents = parseTokenUsage(tokenUsagePath);
  let compressionStats = parseCompressionStats(compressionStatsPath);
  let compressionTriggers = parseCompressionTriggers(compressionTriggersPath);

  // Use provided token events for testing
  if (providedTokenEvents) {
    tokenEvents = providedTokenEvents;
  }

  // Filter by period
  if (period) {
    tokenEvents = filterByPeriod(tokenEvents, period);
    compressionStats = filterByPeriod(compressionStats, period);
    compressionTriggers = filterByPeriod(compressionTriggers, period);
  }

  // Aggregate per agent
  let agentStats = aggregatePerAgent(tokenEvents, compressionTriggers);

  // Filter by agent
  if (agent) {
    agentStats = Object.fromEntries(
      Object.entries(agentStats).filter(([agentId]) => agentId === agent)
    );
  }

  // Calculate overall stats
  const activeAgentsCount = Object.keys(agentStats).length;
  const totalTokens = Object.values(agentStats).reduce((sum, stats) => sum + stats.totalTokens, 0);
  const avgTokens = activeAgentsCount > 0 ? Math.round(totalTokens / activeAgentsCount) : 0;
  const totalCompressionsCount = compressionStats.length;

  // Determine overall status
  let overallStatus = 'HEALTHY';
  for (const stats of Object.values(agentStats)) {
    if (stats.status === 'CRITICAL') {
      overallStatus = 'CRITICAL';
      break;
    } else if (stats.status === 'WARNING') {
      overallStatus = 'WARNING';
    }
  }

  const dashboardData = {
    activeAgents: activeAgentsCount,
    avgTokenUsage: avgTokens,
    totalCompressions: totalCompressionsCount,
    status: overallStatus,
    agents: agentStats,
    compressions: compressionStats
  };

  // JSON output
  if (json) {
    const output = JSON.stringify(dashboardData, null, 2);
    if (exportPath) {
      fs.writeFileSync(exportPath, output, 'utf8');
    }
    return output;
  }

  // ASCII output
  const output = renderDashboard(dashboardData);

  // Export to file
  if (exportPath) {
    fs.writeFileSync(exportPath, output, 'utf8');
  }

  return output;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--agent') {
      options.agent = args[++i];
    } else if (arg === '--period') {
      options.period = args[++i];
    } else if (arg === '--export') {
      options.export = args[++i];
    }
  }

  const output = main(options);
  console.log(output);
}

module.exports = {
  parseTokenUsage,
  parseCompressionStats,
  parseCompressionTriggers,
  aggregatePerAgent,
  renderDashboard,
  main
};
