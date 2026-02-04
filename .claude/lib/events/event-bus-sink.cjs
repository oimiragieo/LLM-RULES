'use strict';

const fs = require('fs');
const path = require('path');
const { EventTypes } = require('./event-types.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const EVENTS_PATH = path.join(RUNTIME_DIR, 'event-bus.jsonl');
const ENABLED = process.env.EVENT_BUS_SINK !== 'off';
const EVENT_BUS_MAX_LINES = Number(process.env.EVENT_BUS_MAX_LINES || 2000);

function ensureRuntimeDir() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function appendEvent(event) {
  try {
    ensureRuntimeDir();
    appendJsonl(EVENTS_PATH, event, { maxLines: EVENT_BUS_MAX_LINES });
  } catch (_err) {
    // Best-effort; never throw from sink.
  }
}

function registerDefaultSinks(eventBus) {
  if (!ENABLED) return;
  const eventTypes = Object.values(EventTypes);
  for (const eventType of eventTypes) {
    eventBus.on(eventType, payload => {
      appendEvent(payload);
    });
  }
}

module.exports = { registerDefaultSinks };
