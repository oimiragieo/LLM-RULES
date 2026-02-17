'use strict';

const path = require('path');
const { safeParseJSON } = require(
  path.join(__dirname, '..', '..', '..', 'lib', 'utils', 'safe-json.cjs')
);

/**
 * Parse Medusa JSON output into standardized findings array.
 * @param {object|string} jsonData - Medusa JSON object or JSON string
 * @returns {Array} Array of standardized findings
 */
function parseMedusaJson(jsonData) {
  let data = jsonData;
  if (typeof data === 'string') {
    data = safeParseJSON(data);
  }

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map(result => ({
    severity: result.severity || 'MEDIUM',
    scanner: result.scanner || '',
    ruleId: result.rule_id || '',
    message: result.message || '',
    file: result.file || '',
    line: result.line || 0,
    column: result.column || 0,
    cweId: result.cwe_id || null,
    category: result.category || 'general',
  }));
}

/**
 * Group findings by severity level.
 * @param {Array} findings - Array of findings
 * @returns {{ CRITICAL: Array, HIGH: Array, MEDIUM: Array, LOW: Array }}
 */
function groupBySeverity(findings) {
  const grouped = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const finding of findings) {
    const severity = finding.severity || 'MEDIUM';
    if (grouped[severity]) {
      grouped[severity].push(finding);
    } else {
      grouped.MEDIUM.push(finding);
    }
  }

  return grouped;
}

/**
 * Filter findings by category.
 * @param {Array} findings - Array of findings
 * @param {string} category - Category to filter by
 * @returns {Array} Filtered findings
 */
function filterByCategory(findings, category) {
  return findings.filter(f => f.category === category);
}

module.exports = {
  parseMedusaJson,
  groupBySeverity,
  filterByCategory,
};
