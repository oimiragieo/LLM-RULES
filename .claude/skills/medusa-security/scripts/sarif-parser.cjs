'use strict';

const path = require('path');
const { safeParseJSON } = require(
  path.join(__dirname, '..', '..', '..', 'lib', 'utils', 'safe-json.cjs')
);

/**
 * Map SARIF level to severity enum.
 * @param {string} level - SARIF level (error, warning, note, none)
 * @returns {string} Severity: CRITICAL, HIGH, MEDIUM, or LOW
 */
function mapSarifLevel(level) {
  switch (level) {
    case 'error':
      return 'HIGH';
    case 'warning':
      return 'MEDIUM';
    case 'note':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}

/**
 * Rule ID prefix to category mapping.
 */
const RULE_CATEGORY_MAP = {
  PI: 'prompt_injection',
  MCP: 'mcp_security',
  SEC: 'secrets',
  AI: 'ai_security',
  AUTH: 'authentication',
  CRYPTO: 'cryptography',
  INJ: 'injection',
  XSS: 'xss',
};

/**
 * Categorize a Medusa rule ID into a human-readable category.
 * Rule IDs follow pattern: MEDUSA-{PREFIX}-{NUMBER}
 * @param {string} ruleId - Medusa rule ID
 * @returns {string} Category name
 */
function categorizeRuleId(ruleId) {
  if (!ruleId || typeof ruleId !== 'string') {
    return 'general';
  }
  const parts = ruleId.split('-');
  // Expected format: MEDUSA-PREFIX-NUMBER
  if (parts.length >= 3 && parts[0] === 'MEDUSA') {
    const prefix = parts[1];
    return RULE_CATEGORY_MAP[prefix] || 'general';
  }
  return 'general';
}

/**
 * Determine severity from SARIF level and rule ID.
 * Promotes error-level AI security findings (prompt injection, MCP) to CRITICAL.
 * @param {string} level - SARIF level
 * @param {string} ruleId - Medusa rule ID
 * @returns {string} Severity
 */
function determineSeverity(level, ruleId) {
  const baseSeverity = mapSarifLevel(level);
  if (baseSeverity === 'HIGH') {
    const category = categorizeRuleId(ruleId);
    if (category === 'prompt_injection' || category === 'ai_security') {
      return 'CRITICAL';
    }
  }
  return baseSeverity;
}

/**
 * Extract location data from a SARIF result's locations array.
 * @param {object} result - SARIF result object
 * @returns {{ file: string, line: number, column: number }}
 */
function extractLocation(result) {
  const empty = { file: '', line: 0, column: 0 };
  if (!Array.isArray(result.locations) || result.locations.length === 0) {
    return empty;
  }
  const phys = (result.locations[0] || {}).physicalLocation;
  if (!phys) {
    return empty;
  }
  const file = phys.artifactLocation && phys.artifactLocation.uri ? phys.artifactLocation.uri : '';
  const line = phys.region ? phys.region.startLine || 0 : 0;
  const column = phys.region ? phys.region.startColumn || 0 : 0;
  return { file, line, column };
}

/**
 * Validate that a data object is valid SARIF v2.1.0.
 * @param {*} data - Parsed data to validate
 * @returns {boolean}
 */
function isValidSarif(data) {
  return data && data.version === '2.1.0' && Array.isArray(data.runs);
}

/**
 * Convert a single SARIF result into a standardized finding.
 * @param {object} result - SARIF result object
 * @returns {object} Standardized finding
 */
function convertResult(result) {
  const ruleId = result.ruleId || 'UNKNOWN';
  const level = result.level || 'warning';
  const message = result.message && result.message.text ? result.message.text : '';
  const location = extractLocation(result);

  return {
    ruleId,
    severity: determineSeverity(level, ruleId),
    category: categorizeRuleId(ruleId),
    message,
    file: location.file,
    line: location.line,
    column: location.column,
  };
}

/**
 * Parse a SARIF v2.1.0 object into standardized findings array.
 * @param {object|string} sarifData - SARIF object or JSON string
 * @returns {Array|{error: string, findings: Array}} Array of findings or error object
 */
function parseSarif(sarifData) {
  let data = sarifData;
  if (typeof data === 'string') {
    data = safeParseJSON(data);
    if (!data || (!data.version && !data.runs)) {
      return { error: 'Failed to parse SARIF JSON string', findings: [] };
    }
  }

  if (!isValidSarif(data)) {
    return { error: 'Invalid SARIF structure: missing version 2.1.0 or runs array', findings: [] };
  }

  const findings = [];
  for (const run of data.runs) {
    if (!Array.isArray(run.results)) {
      continue;
    }
    for (const result of run.results) {
      findings.push(convertResult(result));
    }
  }

  return findings;
}

module.exports = {
  parseSarif,
  mapSarifLevel,
  categorizeRuleId,
  determineSeverity,
  RULE_CATEGORY_MAP,
};
