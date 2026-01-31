/**
 * @file Distributed Tracer for Agent-Studio
 * @description Implements distributed tracing with OpenTelemetry-compatible patterns
 * Part of SPEC-016: Observability & Monitoring Dashboard
 */

const crypto = require('crypto');

class DistributedTracer {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'agent-studio';
    this.traces = [];
    this.activeSpans = new Map();
  }

  /**
   * Start a new span with name and attributes
   * @param {string} name - Span name
   * @param {object} attributes - Span attributes (labels, metadata)
   * @param {string} [parentSpanId] - Parent span ID for nesting
   * @returns {object} Span object with spanId, traceId, startTime, etc.
   */
  startSpan(name, attributes = {}, parentSpanId = null) {
    const spanId = crypto.randomBytes(8).toString('hex');

    // If parent exists, inherit traceId; otherwise create new trace
    let traceId;
    if (parentSpanId && this.activeSpans.has(parentSpanId)) {
      traceId = this.activeSpans.get(parentSpanId).traceId;
    } else {
      traceId = crypto.randomBytes(16).toString('hex');
    }

    const span = {
      spanId,
      traceId,
      parentSpanId,
      name,
      attributes: { ...attributes },
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'in_progress',
      result: null,
      exception: null,
      events: [],
    };

    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * End a span with status and result
   * @param {object} span - Span to end
   * @param {string} status - 'success' or 'error'
   * @param {*} result - Result data
   */
  endSpan(span, status = 'success', result = null) {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.result = result;

    // Move from active to completed traces
    this.activeSpans.delete(span.spanId);
    this.traces.push(span);
  }

  /**
   * Record exception in span
   * @param {object} span - Span to attach exception to
   * @param {Error} error - Error object
   */
  recordException(span, error) {
    span.exception = {
      message: error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack,
      timestamp: Date.now(),
    };
  }

  /**
   * Add event annotation to span
   * @param {object} span - Span to add event to
   * @param {string} name - Event name
   * @param {object} attributes - Event attributes
   */
  addEvent(span, name, attributes = {}) {
    if (!span.events) {
      span.events = [];
    }

    span.events.push({
      name,
      attributes,
      timestamp: Date.now(),
    });
  }

  /**
   * Export traces in specified format
   * @param {string} format - 'json' or 'opentelemetry'
   * @param {object} filters - Filters (startTime, endTime, status)
   * @returns {object} Exported traces
   */
  exportTraces(format = 'json', filters = {}) {
    let filteredTraces = [...this.traces];

    // Apply filters
    if (filters.startTime) {
      filteredTraces = filteredTraces.filter(t => t.startTime >= filters.startTime);
    }

    if (filters.endTime) {
      filteredTraces = filteredTraces.filter(t => t.endTime && t.endTime <= filters.endTime);
    }

    if (filters.status) {
      filteredTraces = filteredTraces.filter(t => t.status === filters.status);
    }

    if (format === 'opentelemetry') {
      return this._exportOpenTelemetry(filteredTraces);
    }

    // Default JSON format
    return {
      format: 'json',
      version: '1.0',
      serviceName: this.serviceName,
      traces: filteredTraces,
      exportTime: Date.now(),
    };
  }

  /**
   * Export traces in OpenTelemetry format
   * @private
   */
  _exportOpenTelemetry(traces) {
    return {
      format: 'opentelemetry',
      version: '1.0.0',
      resourceSpans: [
        {
          resource: {
            attributes: {
              'service.name': this.serviceName,
            },
          },
          scopeSpans: [
            {
              scope: {
                name: 'agent-studio-tracer',
                version: '1.0.0',
              },
              spans: traces.map(t => ({
                traceId: t.traceId,
                spanId: t.spanId,
                parentSpanId: t.parentSpanId || undefined,
                name: t.name,
                kind: 'SPAN_KIND_INTERNAL',
                startTimeUnixNano: t.startTime * 1000000,
                endTimeUnixNano: t.endTime ? t.endTime * 1000000 : undefined,
                attributes: Object.entries(t.attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: String(value) },
                })),
                status: {
                  code: t.status === 'success' ? 'STATUS_CODE_OK' : 'STATUS_CODE_ERROR',
                },
              })),
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate flame graph visualization from traces
   * @param {Array} traces - Array of trace spans
   * @returns {object} Flame graph data structure
   */
  generateFlameGraph(traces) {
    const nodes = traces.map(span => ({
      id: span.spanId,
      name: span.name,
      parentId: span.parentSpanId,
      duration: span.duration || 0,
      startTime: span.startTime,
      endTime: span.endTime,
      status: span.status,
      attributes: span.attributes,
    }));

    // Sort by startTime for hierarchical display
    nodes.sort((a, b) => a.startTime - b.startTime);

    return {
      serviceName: this.serviceName,
      nodes,
      totalDuration: Math.max(...nodes.map(n => n.duration)),
      nodeCount: nodes.length,
    };
  }

  /**
   * Clear all traces (for testing)
   */
  reset() {
    this.traces = [];
    this.activeSpans.clear();
  }
}

module.exports = { DistributedTracer };
