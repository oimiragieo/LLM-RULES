'use strict';
/**
 * content-security-scan: post-execute.cjs
 * Post-execution hook: emits a metric event after each scan completes.
 * Agent: developer | Task: #9 | Session: 2026-02-20
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

try {
  const input = safeParseJSON(fs.readFileSync('/dev/stdin', 'utf8'));
  const { tool_name, tool_input, tool_output } = input || {};

  if (tool_name !== 'Skill' || (tool_input && tool_input.skill !== 'content-security-scan')) {
    process.stdout.write(JSON.stringify({ allow: true }) + '\n');
    process.exit(0);
  }

  // Log scan metric
  const metricRecord = {
    event: 'content_security_scan_complete',
    timestamp: new Date().toISOString(),
    verdict: tool_output && tool_output.verdict ? tool_output.verdict : 'unknown',
    red_flag_count:
      tool_output && Array.isArray(tool_output.red_flags) ? tool_output.red_flags.length : 0,
  };

  const metricsDir = path.join(__dirname, '../../../../context/runtime');
  const metricsPath = path.join(metricsDir, 'scan-metrics.jsonl');
  if (fs.existsSync(metricsDir)) {
    fs.appendFileSync(metricsPath, JSON.stringify(metricRecord) + '\n', 'utf8');
  }
} catch {
  // Non-fatal
}

process.stdout.write(JSON.stringify({ allow: true }) + '\n');
process.exit(0);
