'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'context', 'memory', 'velocity-data.json');

const MAX_COMPLETIONS_PER_AGENT = 100;
const TREND_THRESHOLD = 0.15; // 15% change = significant
const MIN_TASKS_FOR_TREND = 5;

function loadData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return { agents: {} };
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.agents) {
      return { agents: {} };
    }
    return parsed;
  } catch {
    return { agents: {} };
  }
}

function saveData(data) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function recordTaskCompletion(agentType, durationMs, taskId) {
  const data = loadData();
  if (!data.agents[agentType]) {
    data.agents[agentType] = { completions: [] };
  }
  data.agents[agentType].completions.push({
    taskId,
    durationMs,
    timestamp: new Date().toISOString(),
  });
  // FIFO cap
  if (data.agents[agentType].completions.length > MAX_COMPLETIONS_PER_AGENT) {
    data.agents[agentType].completions =
      data.agents[agentType].completions.slice(-MAX_COMPLETIONS_PER_AGENT);
  }
  saveData(data);
}

function getVelocityStats(agentType) {
  const data = loadData();
  const agent = data.agents[agentType];
  if (!agent || !agent.completions || agent.completions.length === 0) {
    return { taskCount: 0, avgDuration: 0, trend: 'stable', last5Durations: [] };
  }
  const completions = agent.completions;
  const totalDuration = completions.reduce((sum, c) => sum + c.durationMs, 0);
  const avgDuration = Math.round(totalDuration / completions.length);
  const last5 = completions.slice(-5).map(c => c.durationMs);

  return {
    taskCount: completions.length,
    avgDuration,
    trend: computeTrend(completions),
    last5Durations: last5,
  };
}

function computeTrend(completions) {
  if (completions.length < MIN_TASKS_FOR_TREND) {
    return 'stable';
  }
  const mid = Math.floor(completions.length / 2);
  const older = completions.slice(0, mid);
  const newer = completions.slice(mid);

  const olderAvg = older.reduce((s, c) => s + c.durationMs, 0) / older.length;
  const newerAvg = newer.reduce((s, c) => s + c.durationMs, 0) / newer.length;

  if (olderAvg === 0) return 'stable';

  const change = (newerAvg - olderAvg) / olderAvg;

  if (change < -TREND_THRESHOLD) return 'improving';
  if (change > TREND_THRESHOLD) return 'degrading';
  return 'stable';
}

function getTrend(agentType) {
  const data = loadData();
  const agent = data.agents[agentType];
  if (!agent || !agent.completions) return 'stable';
  return computeTrend(agent.completions);
}

function getOverallVelocity() {
  const data = loadData();
  const agentTypes = Object.keys(data.agents);
  let totalTasks = 0;
  let totalDuration = 0;
  const agentBreakdown = [];

  for (const agentType of agentTypes) {
    const completions = data.agents[agentType].completions || [];
    const count = completions.length;
    const duration = completions.reduce((s, c) => s + c.durationMs, 0);
    totalTasks += count;
    totalDuration += duration;
    agentBreakdown.push({
      agentType,
      taskCount: count,
      avgDuration: count > 0 ? Math.round(duration / count) : 0,
      trend: computeTrend(completions),
    });
  }

  return {
    totalTasks,
    avgDuration: totalTasks > 0 ? Math.round(totalDuration / totalTasks) : 0,
    agentBreakdown,
  };
}

module.exports = {
  recordTaskCompletion,
  getVelocityStats,
  getOverallVelocity,
  getTrend,
};
