'use strict';

const state = {
  activeAgentIds: new Set(),
  handoff_target: null,
  handoff_executed: false,
  routing_complete: false,
};

function reset() {
  state.activeAgentIds.clear();
  state.handoff_target = null;
  state.handoff_executed = false;
  state.routing_complete = false;
}

function onSubagentStart(payload = {}) {
  const agentId = payload.agent_id;
  if (typeof agentId === 'string' && agentId.trim()) {
    state.activeAgentIds.add(agentId.trim());
  }
}

function onSubagentStop(payload = {}) {
  const agentId = payload.agent_id;
  if (typeof agentId === 'string' && agentId.trim()) {
    state.activeAgentIds.delete(agentId.trim());
  }
}

function getActiveCount() {
  return state.activeAgentIds.size;
}

function isAgentActive(agentId) {
  if (typeof agentId !== 'string') return false;
  return state.activeAgentIds.has(agentId.trim());
}

function setHandoffTarget(agentType) {
  if (typeof agentType !== 'string' || !agentType.trim()) {
    state.handoff_target = null;
    state.handoff_executed = false;
    state.routing_complete = false;
    return;
  }
  state.handoff_target = agentType.trim();
  state.handoff_executed = false;
  state.routing_complete = true;
}

function checkSpawnAllowed(payload = {}) {
  const agentType = typeof payload.agent_type === 'string' ? payload.agent_type.trim() : '';

  if (!state.routing_complete || !state.handoff_target) {
    return { allow: true };
  }

  if (state.handoff_executed) {
    return { allow: true };
  }

  if (agentType === state.handoff_target) {
    state.handoff_executed = true;
    return { allow: true };
  }

  return {
    allow: false,
    reason: `First spawn after routing_complete must be ${state.handoff_target}`,
  };
}

function getHandoffState() {
  return {
    handoff_target: state.handoff_target,
    handoff_executed: state.handoff_executed,
    routing_complete: state.routing_complete,
  };
}

module.exports = {
  reset,
  onSubagentStart,
  onSubagentStop,
  getActiveCount,
  isAgentActive,
  setHandoffTarget,
  checkSpawnAllowed,
  getHandoffState,
};
