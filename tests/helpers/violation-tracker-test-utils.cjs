'use strict';

function makeViolation(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    tool: 'Grep',
    action: 'warn',
    checkName: 'routerSelfCheck',
    routerMode: 'router',
    taskSpawned: false,
    sessionId: 'test',
    ...overrides,
  };
}

module.exports = { makeViolation };
