'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/**
 * Default directory for JSONL metric streams.
 * Most logs (spawn-log, router-churn, runtime-health, violations) live here.
 */
const DEFAULT_METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');

/**
 * Filename prefixes (without extension) for the JSONL streams we aggregate.
 * A file is included if its basename (lowercased) STARTS WITH one of these prefixes
 * and ends with '.jsonl'.
 */
const STREAM_PREFIXES = [
  'flight-recorder',
  'spawn-log',
  'router-churn',
  'runtime-health',
  'violation-tracker',
];

/**
 * Check whether a filename matches one of the JSONL stream patterns.
 * Patterns: flight-recorder*.jsonl, spawn-log*.jsonl, etc.
 *
 * @param {string} basename - The file basename (not full path)
 * @returns {boolean}
 */
function matchesStreamPattern(basename) {
  const lower = basename.toLowerCase();
  if (!lower.endsWith('.jsonl')) return false;
  return STREAM_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Normalize a raw parsed JSONL object into the canonical event shape:
 *   { timestamp, type, component, data: {} }
 *
 * Returns null if the event cannot be normalized (e.g. missing timestamp).
 *
 * @param {Object} raw - Parsed JSONL object
 * @returns {{ timestamp: string, type: string, component: string, data: Object } | null}
 */
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const timestamp = raw.timestamp;
  if (!timestamp || typeof timestamp !== 'string') return null;

  const type = raw.event || raw.type || 'unknown';
  const component = raw.component || 'unknown';

  // Everything except the canonical top-level fields goes into data
  const data = {};
  for (const key of Object.keys(raw)) {
    if (key === 'timestamp' || key === 'event' || key === 'type' || key === 'component') continue;
    data[key] = raw[key];
  }

  return { timestamp, type, component, data };
}

/**
 * Read and parse a single JSONL file, returning normalized events.
 * Invalid lines are silently skipped.
 *
 * @param {string} filePath - Absolute path to the JSONL file
 * @returns {Array<{ timestamp: string, type: string, component: string, data: Object }>}
 */
function readJsonlFile(filePath) {
  const events = [];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    // File unreadable — return empty
    return events;
  }

  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const event = normalizeEvent(raw);
      if (event) events.push(event);
    } catch (_err) {
      // Skip invalid JSONL lines silently
    }
  }
  return events;
}

/**
 * LogAggregator reads and merges events from all JSONL metric streams in a directory.
 *
 * Streams aggregated (by filename prefix):
 *   - flight-recorder*.jsonl
 *   - spawn-log*.jsonl
 *   - router-churn*.jsonl
 *   - runtime-health*.jsonl
 *   - violation-tracker*.jsonl
 *
 * All events are normalized to: { timestamp, type, component, data: {} }
 */
class LogAggregator {
  /**
   * @param {string} [metricsDir] - Directory containing JSONL metric files.
   *   Defaults to the project metrics directory.
   */
  constructor(metricsDir) {
    this.metricsDir = metricsDir || DEFAULT_METRICS_DIR;
  }

  /**
   * Find all JSONL files in metricsDir that match stream patterns.
   *
   * @returns {string[]} Absolute file paths
   */
  _findFiles() {
    if (!fs.existsSync(this.metricsDir)) return [];

    let entries;
    try {
      entries = fs.readdirSync(this.metricsDir);
    } catch (_err) {
      return [];
    }

    return entries
      .filter(name => matchesStreamPattern(name))
      .map(name => path.join(this.metricsDir, name));
  }

  /**
   * Read all events from all matching JSONL files, sorted by timestamp ascending.
   *
   * @returns {Array<{ timestamp: string, type: string, component: string, data: Object }>}
   */
  _readAllEvents() {
    const files = this._findFiles();
    const allEvents = [];
    for (const file of files) {
      const events = readJsonlFile(file);
      for (const ev of events) {
        allEvents.push(ev);
      }
    }
    allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return allEvents;
  }

  /**
   * Query events from all JSONL streams with optional filters.
   *
   * @param {Object} [options]
   * @param {{ start?: string, end?: string }} [options.timeRange] - ISO timestamp bounds (inclusive)
   * @param {string[]} [options.eventTypes] - Only include events whose type is in this list
   * @param {string[]} [options.components] - Only include events whose component is in this list
   * @param {number} [options.limit] - Maximum number of events to return (applied after sorting/filtering)
   * @returns {Array<{ timestamp: string, type: string, component: string, data: Object }>}
   */
  query(options) {
    const { timeRange, eventTypes, components, limit } = options || {};

    let events = this._readAllEvents();

    if (timeRange) {
      const startMs = timeRange.start != null ? new Date(timeRange.start).getTime() : -Infinity;
      const endMs = timeRange.end != null ? new Date(timeRange.end).getTime() : Infinity;
      events = events.filter(e => {
        const ts = new Date(e.timestamp).getTime();
        return ts >= startMs && ts <= endMs;
      });
    }

    if (eventTypes && eventTypes.length > 0) {
      events = events.filter(e => eventTypes.includes(e.type));
    }

    if (components && components.length > 0) {
      events = events.filter(e => components.includes(e.component));
    }

    if (limit != null && limit > 0) {
      events = events.slice(0, limit);
    }

    return events;
  }

  /**
   * Return the last N events across all streams, sorted by timestamp ascending.
   *
   * @param {number} count - Number of recent events to return
   * @returns {Array<{ timestamp: string, type: string, component: string, data: Object }>}
   */
  getRecentEvents(count) {
    if (!count || count <= 0) return [];
    const events = this._readAllEvents();
    return events.slice(-count);
  }

  /**
   * Return events filtered by event type, with optional time range.
   *
   * @param {string} type - Event type to filter by
   * @param {{ start?: string, end?: string }} [timeRange] - Optional ISO timestamp bounds
   * @returns {Array<{ timestamp: string, type: string, component: string, data: Object }>}
   */
  getEventsByType(type, timeRange) {
    return this.query({ eventTypes: [type], timeRange });
  }
}

module.exports = { LogAggregator };
