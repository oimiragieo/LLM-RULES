'use strict';

const fs = require('fs');
const path = require('path');
const { EventTypes } = require('./event-types.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const { record: recordToFlightRecorder } = require('../monitoring/flight-recorder.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const EVENTS_PATH = path.join(RUNTIME_DIR, 'event-bus.jsonl');
const ENABLED = process.env.EVENT_BUS_SINK !== 'off';
const FLIGHT_RECORDER_ENABLED = process.env.FLIGHT_RECORDER !== 'off';
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

    if (FLIGHT_RECORDER_ENABLED) {
      recordToFlightRecorder({
        event: `bus_${event.type}`,
        component: 'event_bus',
        traceId: event.traceId,
        payload: event,
      });
    }
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
