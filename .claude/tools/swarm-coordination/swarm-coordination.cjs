'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function loadState(runtimeDir) {
  const filePath = path.join(runtimeDir, 'swarm-coordination.json');
  try {
    if (!fs.existsSync(filePath)) {
      return { filePath, state: { updatedAt: null, agents: {}, events: [] } };
    }
    const parsed = safeParseJSON(fs.readFileSync(filePath, 'utf8'), null);
    const state = parsed && typeof parsed === 'object' ? parsed : {};
    return {
      filePath,
      state: {
        updatedAt: state.updatedAt || null,
        agents: state.agents && typeof state.agents === 'object' ? state.agents : {},
        events: Array.isArray(state.events) ? state.events : [],
      },
    };
  } catch (_e) {
    return { filePath, state: { updatedAt: null, agents: {}, events: [] } };
  }
}

function saveState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function applyOperation(state, input) {
  const operation = String(input.operation || 'status').toLowerCase();
  const now = new Date().toISOString();
  const agentId = input.agentId ? String(input.agentId) : null;

  if (operation === 'join') {
    if (!agentId) return { ok: false, error: 'agentId is required for join' };
    state.agents[agentId] = {
      role: String(input.role || 'worker'),
      status: 'active',
      lastSeen: now,
    };
  } else if (operation === 'heartbeat') {
    if (!agentId) return { ok: false, error: 'agentId is required for heartbeat' };
    state.agents[agentId] = {
      ...(state.agents[agentId] || { role: String(input.role || 'worker') }),
      status: 'active',
      lastSeen: now,
    };
  } else if (operation === 'leave') {
    if (!agentId) return { ok: false, error: 'agentId is required for leave' };
    delete state.agents[agentId];
  } else if (operation === 'record') {
    state.events.push({
      type: String(input.type || 'event'),
      payload: input.payload || {},
      timestamp: now,
      agentId,
    });
    state.events = state.events.slice(-200);
  } else if (operation !== 'status') {
    return { ok: false, error: `unknown operation: ${operation}` };
  }

  state.updatedAt = now;
  return {
    ok: true,
    operation,
    agentCount: Object.keys(state.agents).length,
    state,
  };
}

function parseInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function main() {
  const input = parseInput();
  const runtimeDir =
    input.runtimeDir || path.join(process.cwd(), '.claude', 'context', 'runtime');
  const { filePath, state } = loadState(runtimeDir);
  const result = applyOperation(state, input);
  if (result.ok) {
    saveState(filePath, state);
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  }
}

module.exports = { main };
