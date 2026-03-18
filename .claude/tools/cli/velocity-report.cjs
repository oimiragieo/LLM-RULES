#!/usr/bin/env node
'use strict';

const { getOverallVelocity, getVelocityStats } = require('../../lib/metrics/velocity-tracker.cjs');

const overall = getOverallVelocity();

console.log('=== Velocity Report ===\n');
console.log(`Total tasks tracked: ${overall.totalTasks}`);
console.log(
  `Overall avg duration: ${overall.avgDuration ? (overall.avgDuration / 1000).toFixed(1) + 's' : 'N/A'}`
);
console.log(`\nAgent breakdown:`);

if (overall.agentBreakdown.length === 0) {
  console.log('  No velocity data recorded yet.');
} else {
  for (const agent of overall.agentBreakdown) {
    const stats = getVelocityStats(agent.agentType);
    const trendIcon = agent.trend === 'improving' ? '+' : agent.trend === 'degrading' ? '-' : '=';
    console.log(
      `  ${agent.agentType}: ${agent.taskCount} tasks, avg ${(agent.avgDuration / 1000).toFixed(1)}s [${trendIcon} ${agent.trend}]`
    );
    if (stats.last5Durations.length > 0) {
      console.log(
        `    last 5: ${stats.last5Durations.map(d => (d / 1000).toFixed(1) + 's').join(', ')}`
      );
    }
  }
}
