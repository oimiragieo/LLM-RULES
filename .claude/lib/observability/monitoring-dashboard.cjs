/**
 * @file Monitoring Dashboard Generator
 * @description Generates HTML dashboard and JSON export for observability metrics
 * Part of SPEC-016: Observability & Monitoring Dashboard
 */

/**
 * Generate HTML monitoring dashboard
 * @param {object} metrics - Metrics from MetricsCollector
 * @param {Array} traces - Trace data from DistributedTracer
 * @param {object} options - Dashboard options (refreshInterval, etc.)
 * @returns {string} HTML dashboard
 */
function generateMonitoringDashboard(metrics, traces = [], options = {}) {
  const { refreshInterval = 0 } = options;

  // Calculate derived metrics
  const tasksCreated = metrics.counters.tasksCreated || 0;
  const tasksCompleted = metrics.counters.tasksCompleted || 0;
  const tasksFailed = metrics.counters.tasksFailed || 0;
  const totalTasks = tasksCompleted + tasksFailed;
  const errorRate = totalTasks > 0 ? ((tasksFailed / totalTasks) * 100).toFixed(1) : 0;

  const memoryUsedMB = metrics.gauges.memoryUsedMB || 0;
  const concurrentTasks = metrics.gauges.concurrentTasks || 0;
  const activeTasks = metrics.gauges.activeTasks || 0;
  const pendingTasks = metrics.gauges.pendingTasks || 0;
  const contextUsedPercent = metrics.gauges.contextUsedPercent || 0;

  // Calculate average duration
  let avgDuration = 0;
  if (metrics.histograms && metrics.histograms.taskDurationMs) {
    avgDuration = metrics.histograms.taskDurationMs.mean || 0;
  }

  // Build HTML
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Monitoring Dashboard - Agent Studio</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #007acc;
      padding-bottom: 10px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .metric-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 5px;
    }
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      color: #007acc;
    }
    .metric-unit {
      font-size: 14px;
      color: #999;
    }
    .health-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .health-ok { background-color: #28a745; }
    .health-warn { background-color: #ffc107; }
    .health-error { background-color: #dc3545; }
    .section {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .section h2 {
      margin-top: 0;
      color: #333;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    th {
      background-color: #f9f9f9;
      font-weight: 600;
      color: #333;
    }
    .refresh-info {
      text-align: right;
      color: #999;
      font-size: 12px;
      margin-top: 10px;
    }
    canvas {
      max-width: 100%;
      height: 200px;
    }
  </style>
  ${refreshInterval > 0 ? `<meta http-equiv="refresh" content="${refreshInterval}">` : ''}
</head>
<body>
  <div class="container">
    <h1>Monitoring Dashboard</h1>
    <p>Real-time observability for Agent Studio</p>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Tasks Created</div>
        <div class="metric-value">${tasksCreated}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Tasks Completed</div>
        <div class="metric-value">${tasksCompleted}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Tasks Failed</div>
        <div class="metric-value">${tasksFailed}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Error Rate</div>
        <div class="metric-value">${errorRate}%</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Memory Used</div>
        <div class="metric-value">${memoryUsedMB} <span class="metric-unit">MB</span></div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Concurrent Tasks</div>
        <div class="metric-value">${concurrentTasks}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Avg Duration</div>
        <div class="metric-value">${avgDuration.toFixed(0)} <span class="metric-unit">ms</span></div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Context Used</div>
        <div class="metric-value">${contextUsedPercent.toFixed(1)}%</div>
      </div>
    </div>

    <div class="section">
      <h2>System Health</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Current</th>
            <th>Target</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Memory Usage</td>
            <td>${memoryUsedMB} MB</td>
            <td>&lt;200 MB</td>
            <td><span class="health-indicator ${memoryUsedMB < 200 ? 'health-ok' : 'health-warn'}"></span>${memoryUsedMB < 200 ? 'OK' : 'WARN'}</td>
          </tr>
          <tr>
            <td>Active Tasks</td>
            <td>${activeTasks}</td>
            <td>&lt;100</td>
            <td><span class="health-indicator ${activeTasks < 100 ? 'health-ok' : 'health-warn'}"></span>${activeTasks < 100 ? 'OK' : 'WARN'}</td>
          </tr>
          <tr>
            <td>Pending Tasks</td>
            <td>${pendingTasks}</td>
            <td>&lt;50</td>
            <td><span class="health-indicator ${pendingTasks < 50 ? 'health-ok' : 'health-warn'}"></span>${pendingTasks < 50 ? 'OK' : 'WARN'}</td>
          </tr>
          <tr>
            <td>Error Rate</td>
            <td>${errorRate}%</td>
            <td>&lt;5%</td>
            <td><span class="health-indicator ${errorRate < 5 ? 'health-ok' : 'health-warn'}"></span>${errorRate < 5 ? 'OK' : 'WARN'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${
      metrics.recentErrors && metrics.recentErrors.length > 0
        ? `
    <div class="section">
      <h2>Recent Errors</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Error</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.recentErrors
            .map(
              err => `
            <tr>
              <td>${new Date(err.timestamp).toLocaleTimeString()}</td>
              <td>${err.message}</td>
              <td>${JSON.stringify(err.context || {})}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <div class="section">
      <h2>Duration Trend</h2>
      <canvas id="durationChart"></canvas>
    </div>

    <div class="section">
      <h2>Agent Breakdown</h2>
      <p>Per-agent performance metrics</p>
    </div>

    <div class="section">
      <h2>Feature Breakdown</h2>
      <p>Per-feature (SPEC) performance metrics</p>
    </div>

    ${refreshInterval > 0 ? `<div class="refresh-info">Auto-refresh: ${refreshInterval}s</div>` : ''}
  </div>
</body>
</html>`;

  return html;
}

/**
 * Generate metrics JSON export
 * @param {object} metrics - Metrics from MetricsCollector
 * @returns {string} JSON string
 */
function generateMetricsJSON(metrics) {
  const exportData = {
    ...metrics,
    exportTime: Date.now(),
  };

  return JSON.stringify(exportData, null, 2);
}

module.exports = {
  generateMonitoringDashboard,
  generateMetricsJSON,
};
