'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesType(value, typeName) {
  switch (typeName) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'nullable-string':
      return value === null || typeof value === 'string';
    case 'nullable-number':
      return value === null || (typeof value === 'number' && Number.isFinite(value));
    default:
      return false;
  }
}

const METRIC_EVENT_SCHEMAS = {
  spawn_start: {
    required: {
      event: 'string',
      timestamp: 'string',
      task_id: 'nullable-string',
      prompt_length: 'nullable-number',
    },
  },
  spawn_end: {
    required: {
      event: 'string',
      timestamp: 'string',
      task_id: 'nullable-string',
      success: 'boolean',
    },
  },
  memory_load_failed: {
    required: {
      event: 'string',
      timestamp: 'string',
      task_id: 'nullable-string',
      error: 'nullable-string',
    },
  },
  spawn_assembly: {
    required: {
      event: 'string',
      timestamp: 'string',
      total_ms: 'nullable-number',
      phases: 'object',
    },
  },
  spawn_rag: {
    required: {
      event: 'string',
      timestamp: 'string',
      task_id: 'nullable-string',
      rag_enabled: 'boolean',
      rag_section_added: 'boolean',
      rag_memory_query_len: 'number',
    },
  },
  token_burn: {
    required: {
      event: 'string',
      timestamp: 'string',
      source: 'string',
      input_tokens_est: 'number',
      output_tokens_est: 'number',
      delta_tokens_est: 'number',
    },
  },
  router_guard_decision: {
    required: {
      event: 'string',
      timestamp: 'string',
      result: 'string',
      duration_ms: 'nullable-number',
    },
  },
  router_cost_risk: {
    required: {
      event: 'string',
      timestamp: 'string',
      score: 'number',
      level: 'string',
      factors: 'object',
    },
  },
  router_slo_alert: {
    required: {
      event: 'string',
      timestamp: 'string',
      severity: 'string',
      slo_name: 'string',
      value: 'number',
      threshold: 'number',
      downgraded: 'boolean',
    },
  },
  runtime_health: {
    required: {
      event: 'string',
      timestamp: 'string',
      component: 'string',
      status: 'string',
      rss_mb: 'number',
      heap_used_mb: 'number',
      heap_total_mb: 'number',
      external_mb: 'number',
    },
  },
  router_violation: {
    required: {
      event: 'string',
      timestamp: 'string',
      tool: 'string',
      action: 'string',
      checkName: 'string',
      routerMode: 'string',
      sessionId: 'string',
    },
  },
  router_violation_legacy: {
    required: {
      timestamp: 'string',
      tool: 'string',
      action: 'string',
      checkName: 'string',
      routerMode: 'string',
      sessionId: 'string',
    },
  },
};

function validateMetricRow(row) {
  if (!isPlainObject(row)) {
    return { valid: false, errors: ['row must be object'] };
  }
  let eventName = row.event;
  if (
    (typeof eventName !== 'string' || !eventName) &&
    typeof row.tool === 'string' &&
    typeof row.action === 'string' &&
    typeof row.checkName === 'string'
  ) {
    eventName = 'router_violation_legacy';
  }
  if (typeof eventName !== 'string' || !eventName) {
    return { valid: false, errors: ['event is required'] };
  }
  const schema = METRIC_EVENT_SCHEMAS[eventName];
  if (!schema) {
    return { valid: false, errors: [`unknown event schema: ${eventName}`] };
  }

  const errors = [];
  for (const [field, typeName] of Object.entries(schema.required || {})) {
    if (!matchesType(row[field], typeName)) {
      errors.push(`${field} must be ${typeName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateJsonlFile(filePath, options = {}) {
  const fs = require('fs');
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
    : [];
  const result = {
    lines: lines.length,
    parseErrors: 0,
    schemaErrors: 0,
    validLines: 0,
    errors: [],
  };

  const maxErrors = Number(options.maxErrors || 20);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      result.parseErrors++;
      if (result.errors.length < maxErrors) {
        result.errors.push({ line: index + 1, kind: 'parse', message: err.message });
      }
      continue;
    }
    const validation = validateMetricRow(parsed);
    if (!validation.valid) {
      result.schemaErrors++;
      if (result.errors.length < maxErrors) {
        result.errors.push({
          line: index + 1,
          kind: 'schema',
          message: validation.errors.join('; '),
        });
      }
      continue;
    }
    result.validLines++;
  }

  return result;
}

module.exports = {
  METRIC_EVENT_SCHEMAS,
  validateMetricRow,
  validateJsonlFile,
};
