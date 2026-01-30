/**
 * Track Analytics Library (SPEC-008)
 * Provides query functions and reporting for track metadata
 *
 * Features:
 * - queryByPhase: Group tasks by phase with aggregated metrics
 * - queryByAgent: Group tasks by agent with completion metrics
 * - queryByStatus: Group tasks by status with timeline metrics
 * - computeProjectMetrics: Aggregate project-wide statistics
 * - generateReport: Create markdown analytics report
 */

/**
 * Query tracks by phase state
 * @param {string} phaseId - Phase to query (e.g., 'deployed', 'implementation')
 * @param {Array} tracksData - Array of track metadata objects
 * @returns {Object} Query result with tasks and aggregated metrics
 */
function queryByPhase(phaseId, tracksData) {
  if (!Array.isArray(tracksData)) {
    throw new TypeError('tracksData must be an array');
  }

  const tasks = tracksData.filter(track => track.phaseState === phaseId);

  // Compute aggregate metrics
  const estimatedDays = tasks.filter(t => t.estimatedEffort?.days).map(t => t.estimatedEffort.days);
  const actualDays = tasks.filter(t => t.actualEffort?.days).map(t => t.actualEffort.days);

  const avgEstimatedDays =
    estimatedDays.length > 0
      ? estimatedDays.reduce((sum, d) => sum + d, 0) / estimatedDays.length
      : 0;

  const avgActualDays =
    actualDays.length > 0 ? actualDays.reduce((sum, d) => sum + d, 0) / actualDays.length : 0;

  return {
    phase: phaseId,
    tasks,
    metrics: {
      totalTasks: tasks.length,
      avgEstimatedDays,
      avgActualDays,
    },
  };
}

/**
 * Query tracks by assigned agent
 * @param {string} agentId - Agent to query (e.g., 'developer', 'qa')
 * @param {Array} tracksData - Array of track metadata objects
 * @returns {Object} Query result with tasks and completion metrics
 */
function queryByAgent(agentId, tracksData) {
  if (!Array.isArray(tracksData)) {
    throw new TypeError('tracksData must be an array');
  }

  const tasks = tracksData.filter(track => track.assignee === agentId);

  // Compute completion metrics
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const completionRate = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  // Compute effort accuracy (estimated vs actual)
  const tasksWithEffort = tasks.filter(t => t.estimatedEffort?.days && t.actualEffort?.days);

  const avgEstimatedDays =
    tasksWithEffort.length > 0
      ? tasksWithEffort.reduce((sum, t) => sum + t.estimatedEffort.days, 0) / tasksWithEffort.length
      : 0;

  const avgActualDays =
    tasksWithEffort.length > 0
      ? tasksWithEffort.reduce((sum, t) => sum + t.actualEffort.days, 0) / tasksWithEffort.length
      : 0;

  // Estimate accuracy: how close actual is to estimated (100% = perfect)
  const estimateAccuracy =
    avgEstimatedDays > 0
      ? 100 - (Math.abs(avgActualDays - avgEstimatedDays) / avgEstimatedDays) * 100
      : 0;

  return {
    agent: agentId,
    tasks,
    metrics: {
      completedTasks,
      inProgressTasks,
      completionRate,
      avgEstimatedDays,
      avgActualDays,
      estimateAccuracy,
    },
  };
}

/**
 * Query tracks by status
 * @param {string} status - Status to query (e.g., 'completed', 'in_progress')
 * @param {Array} tracksData - Array of track metadata objects
 * @returns {Object} Query result with tasks and timeline metrics
 */
function queryByStatus(status, tracksData) {
  if (!Array.isArray(tracksData)) {
    throw new TypeError('tracksData must be an array');
  }

  const tasks = tracksData.filter(track => track.status === status);

  // Sort by updated_at (most recent first)
  tasks.sort((a, b) => {
    if (!a.updated_at) return 1;
    if (!b.updated_at) return -1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  // Compute timeline metrics (created -> updated duration)
  const durations = tasks
    .filter(t => t.created_at && t.updated_at)
    .map(t => {
      try {
        const created = new Date(t.created_at);
        const updated = new Date(t.updated_at);
        return (updated - created) / (1000 * 60 * 60 * 24); // Convert to days
      } catch (_err) {
        return null;
      }
    })
    .filter(d => d !== null);

  const avgDurationDays =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

  // Group by type
  const byType = {};
  tasks.forEach(t => {
    byType[t.type] = (byType[t.type] || 0) + 1;
  });

  return {
    status,
    tasks,
    metrics: {
      totalTasks: tasks.length,
      avgDurationDays,
      byType,
    },
  };
}

/**
 * Compute project-wide metrics
 * @param {Array} tracksData - Array of track metadata objects
 * @returns {Object} Aggregated project statistics
 */
function computeProjectMetrics(tracksData) {
  if (!Array.isArray(tracksData)) {
    throw new TypeError('tracksData must be an array');
  }

  const totalTasks = tracksData.length;
  const completedTasks = tracksData.filter(t => t.status === 'completed').length;
  const completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Effort metrics
  const totalEstimatedDays = tracksData
    .filter(t => t.estimatedEffort?.days)
    .reduce((sum, t) => sum + t.estimatedEffort.days, 0);

  const totalActualDays = tracksData
    .filter(t => t.actualEffort?.days)
    .reduce((sum, t) => sum + t.actualEffort.days, 0);

  // Average effort multiplier (actual / estimated)
  const tasksWithEffort = tracksData.filter(
    t => t.estimatedEffort?.days && t.actualEffort?.days && t.estimatedEffort.days > 0
  );

  const avgEffortMultiplier =
    tasksWithEffort.length > 0
      ? tasksWithEffort.reduce((sum, t) => sum + t.actualEffort.days / t.estimatedEffort.days, 0) /
        tasksWithEffort.length
      : null;

  // Phases completed
  const phasesCompleted = {};
  tracksData.forEach(t => {
    if (t.phaseState) {
      phasesCompleted[t.phaseState] = (phasesCompleted[t.phaseState] || 0) + 1;
    }
  });

  // By priority
  const byPriority = {};
  tracksData.forEach(t => {
    if (t.priority) {
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    }
  });

  return {
    totalTasks,
    completedTasks,
    completionPercentage,
    totalEstimatedDays,
    totalActualDays,
    avgEffortMultiplier,
    phasesCompleted,
    byPriority,
  };
}

/**
 * Generate markdown analytics report
 * @param {Array} tracksData - Array of track metadata objects
 * @returns {string} Markdown formatted report
 */
function generateReport(tracksData) {
  if (!Array.isArray(tracksData)) {
    throw new TypeError('tracksData must be an array');
  }

  if (tracksData.length === 0) {
    return '# Track Analytics Report\n\nNo tracks found.\n';
  }

  const metrics = computeProjectMetrics(tracksData);
  const timestamp = new Date().toISOString();

  let report = `# Track Analytics Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;

  // Project Metrics
  report += `## Project Metrics\n\n`;
  report += `- **Total Tasks:** ${metrics.totalTasks}\n`;
  report += `- **Completed:** ${metrics.completedTasks}\n`;
  report += `- **Completion Percentage:** ${metrics.completionPercentage.toFixed(1)}%\n`;
  report += `- **Total Estimated:** ${metrics.totalEstimatedDays} days\n`;
  report += `- **Total Actual:** ${metrics.totalActualDays} days\n`;
  if (metrics.avgEffortMultiplier !== null) {
    report += `- **Avg Effort Multiplier:** ${metrics.avgEffortMultiplier.toFixed(2)}x\n`;
  }
  report += `\n`;

  // Phase Breakdown
  report += `## Phase Breakdown\n\n`;
  if (Object.keys(metrics.phasesCompleted).length > 0) {
    Object.entries(metrics.phasesCompleted)
      .sort((a, b) => b[1] - a[1])
      .forEach(([phase, count]) => {
        report += `- **${phase}:** ${count} tasks\n`;
      });
  } else {
    report += `No phase data available.\n`;
  }
  report += `\n`;

  // Priority Breakdown
  report += `## Priority Breakdown\n\n`;
  if (Object.keys(metrics.byPriority).length > 0) {
    Object.entries(metrics.byPriority)
      .sort((a, b) => b[1] - a[1])
      .forEach(([priority, count]) => {
        report += `- **${priority}:** ${count} tasks\n`;
      });
  } else {
    report += `No priority data available.\n`;
  }
  report += `\n`;

  // Agent Metrics
  const agents = [...new Set(tracksData.filter(t => t.assignee).map(t => t.assignee))];
  if (agents.length > 0) {
    report += `## Agent Metrics\n\n`;
    agents.forEach(agent => {
      const agentData = queryByAgent(agent, tracksData);
      report += `### ${agent}\n\n`;
      report += `- Completed: ${agentData.metrics.completedTasks}\n`;
      report += `- In Progress: ${agentData.metrics.inProgressTasks}\n`;
      report += `- Completion Rate: ${agentData.metrics.completionRate.toFixed(1)}%\n`;
      if (agentData.metrics.avgEstimatedDays > 0) {
        report += `- Avg Estimated: ${agentData.metrics.avgEstimatedDays.toFixed(1)} days\n`;
        report += `- Avg Actual: ${agentData.metrics.avgActualDays.toFixed(1)} days\n`;
        report += `- Estimate Accuracy: ${agentData.metrics.estimateAccuracy.toFixed(1)}%\n`;
      }
      report += `\n`;
    });
  }

  // Insights (auto-generated)
  report += `## Insights\n\n`;
  const insights = [];

  // Insight: Faster than estimated
  if (metrics.avgEffortMultiplier !== null && metrics.avgEffortMultiplier < 1) {
    const percentage = ((1 - metrics.avgEffortMultiplier) * 100).toFixed(1);
    insights.push(
      `- Implementation is ${percentage}% faster than estimated on average (under budget)`
    );
  }

  // Insight: Slower than estimated
  if (metrics.avgEffortMultiplier !== null && metrics.avgEffortMultiplier > 1.2) {
    const percentage = ((metrics.avgEffortMultiplier - 1) * 100).toFixed(1);
    insights.push(
      `- Implementation is ${percentage}% slower than estimated (estimates may need adjustment)`
    );
  }

  // Insight: Critical items
  if (metrics.byPriority.critical > 0) {
    insights.push(`- ${metrics.byPriority.critical} critical priority items require attention`);
  }

  // Insight: Completion rate
  if (metrics.completionPercentage < 50) {
    insights.push(
      `- Project is ${metrics.completionPercentage.toFixed(1)}% complete (early stage)`
    );
  } else if (metrics.completionPercentage >= 80) {
    insights.push(
      `- Project is ${metrics.completionPercentage.toFixed(1)}% complete (nearing completion)`
    );
  }

  if (insights.length > 0) {
    insights.forEach(insight => {
      report += `${insight}\n`;
    });
  } else {
    report += `No insights generated.\n`;
  }
  report += `\n`;

  // Task Lists by Status
  const statuses = [
    { key: 'completed', label: 'Completed' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'review', label: 'Review' },
    { key: 'new', label: 'New' },
  ];

  statuses.forEach(({ key, label }) => {
    const statusData = queryByStatus(key, tracksData);
    if (statusData.tasks.length > 0) {
      report += `### ${label} Tasks\n\n`;
      statusData.tasks.slice(0, 10).forEach(task => {
        report += `- **${task.trackId}**: ${task.description || 'No description'}\n`;
      });
      if (statusData.tasks.length > 10) {
        report += `- ... and ${statusData.tasks.length - 10} more\n`;
      }
      report += `\n`;
    }
  });

  return report;
}

module.exports = {
  queryByPhase,
  queryByAgent,
  queryByStatus,
  computeProjectMetrics,
  generateReport,
};
