#!/usr/bin/env node
// @ts-check
/**
 * Monitoring Dashboard CLI
 *
 * Command-line tool for viewing monitoring metrics and alerts.
 *
 * Usage:
 *   node monitoring-dashboard.js --live      # Real-time updates (every 5s)
 *   node monitoring-dashboard.js --summary   # 24h summary (default)
 *   node monitoring-dashboard.js --trends    # 7-day trends
 *   node monitoring-dashboard.js --alerts    # Show current alerts
 *
 * @module tools/cli/monitoring-dashboard
 */

const path = require('path');
const { getMetricsSummary, _findSlowHooks, detectAlerts } = require(
  path.join(process.cwd(), '.claude', 'lib', 'monitoring', 'metrics-reader.cjs')
);
const { renderDashboard, _renderCompactSummary } = require(
  path.join(process.cwd(), '.claude', 'lib', 'monitoring', 'dashboard-renderer.cjs')
);

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  return {
    live: args.includes('--live'),
    summary: args.includes('--summary') || args.length === 0,
    trends: args.includes('--trends'),
    alerts: args.includes('--alerts'),
    hours: parseInt(args.find(arg => arg.startsWith('--hours='))?.split('=')[1] || '24', 10),
  };
}

/**
 * Display dashboard
 */
async function displayDashboard(options = {}) {
  try {
    const hours = options.hours || 24;

    // Get metrics summary
    const summary = await getMetricsSummary({ hours });

    // Detect alerts
    const alerts = detectAlerts(summary);

    // Render dashboard
    const dashboard = renderDashboard(summary, alerts);

    // Clear screen if live mode
    if (options.live) {
      console.clear();
    }

    // Display dashboard
    console.log(dashboard);

    // Display timestamp
    console.log(`\nLast updated: ${new Date().toLocaleString()}`);

    // Display refresh message in live mode
    if (options.live) {
      console.log('(Refreshing every 5 seconds. Press Ctrl+C to exit)');
    }
  } catch (error) {
    console.error('Error displaying dashboard:', error.message);
    process.exit(1);
  }
}

/**
 * Display alerts only
 */
async function displayAlerts(options = {}) {
  try {
    const hours = options.hours || 24;

    // Get metrics summary
    const summary = await getMetricsSummary({ hours });

    // Detect alerts
    const alerts = detectAlerts(summary);

    if (alerts.length === 0) {
      console.log('✓ No alerts detected');
      return;
    }

    console.log(`\nCurrent Alerts (Last ${hours}h):\n`);
    alerts.forEach(alert => {
      console.log(`  [${alert.severity}] ${alert.type}: ${alert.message}`);
    });
    console.log('');
  } catch (error) {
    console.error('Error displaying alerts:', error.message);
    process.exit(1);
  }
}

/**
 * Display trends (7-day view)
 */
async function displayTrends() {
  try {
    console.log('\n7-Day Metrics Trends:\n');

    // Get metrics for each of the last 7 days
    const days = [];
    for (let i = 0; i < 7; i++) {
      const hoursAgo = i * 24;
      const summary = await getMetricsSummary({ hours: 24 });
      days.push({
        date: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString().split('T')[0],
        hookCalls: summary.hooks.total,
        avgTime: summary.hooks.avgTime,
        errors: summary.errors.total,
      });
    }

    // Display trends table
    console.log('Date       | Hook Calls | Avg Time | Errors');
    console.log('-----------|------------|----------|-------');
    days.reverse().forEach(day => {
      console.log(
        `${day.date} | ${String(day.hookCalls).padStart(10)} | ${day.avgTime.toFixed(2)}ms   | ${day.errors}`
      );
    });
    console.log('');
  } catch (error) {
    console.error('Error displaying trends:', error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.alerts) {
    await displayAlerts(options);
    return;
  }

  if (options.trends) {
    await displayTrends();
    return;
  }

  if (options.live) {
    // Live mode: update every 5 seconds
    await displayDashboard({ ...options, live: true });

    setInterval(async () => {
      await displayDashboard({ ...options, live: true });
    }, 5000);
  } else {
    // Single display
    await displayDashboard(options);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  displayDashboard,
  displayAlerts,
  displayTrends,
};
