#!/usr/bin/env node
/**
 * Track Analytics Validator Hook (SPEC-008)
 * PreToolUse hook for validating track metadata analytics fields
 *
 * Validates:
 * - metrics.elapsedTimeMs >= 0
 * - metrics.effortMultiplier in [0.5, 5]
 * - metrics.riskScore in [0, 100]
 * - metrics.completionRate in [0, 100]
 * - reporting.generatedAt is valid ISO 8601
 * - reporting.insights is array of strings
 *
 * Environment Variables:
 * - TRACK_ANALYTICS_VALIDATOR=block|warn|off (default: warn)
 *
 * Exit Codes:
 * - 0: Validation passed or warnings only
 * - 1: Validation failed (block mode)
 */

const fs = require('fs');
const path = require('path');

const MODE = process.env.TRACK_ANALYTICS_VALIDATOR || 'warn';

/**
 * Parse hook input from stdin
 * @returns {Promise<Object>} Parsed hook input
 */
async function readInput() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Failed to parse input: ${err.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Validate analytics metrics
 * @param {Object} metrics - Metrics object to validate
 * @returns {Array<string>} Array of validation errors (empty if valid)
 */
function validateMetrics(metrics) {
  const errors = [];

  if (!metrics || typeof metrics !== 'object') {
    return errors; // metrics is optional
  }

  // Validate elapsedTimeMs
  if (metrics.elapsedTimeMs !== undefined) {
    if (typeof metrics.elapsedTimeMs !== 'number') {
      errors.push('metrics.elapsedTimeMs must be a number');
    } else if (metrics.elapsedTimeMs < 0) {
      errors.push('metrics.elapsedTimeMs must be >= 0');
    }
  }

  // Validate effortMultiplier
  if (metrics.effortMultiplier !== undefined) {
    if (typeof metrics.effortMultiplier !== 'number') {
      errors.push('metrics.effortMultiplier must be a number');
    } else if (metrics.effortMultiplier < 0.5) {
      errors.push('metrics.effortMultiplier must be >= 0.5');
    } else if (metrics.effortMultiplier > 5) {
      errors.push('metrics.effortMultiplier must be <= 5');
    }
  }

  // Validate riskScore
  if (metrics.riskScore !== undefined) {
    if (typeof metrics.riskScore !== 'number') {
      errors.push('metrics.riskScore must be a number');
    } else if (metrics.riskScore < 0) {
      errors.push('metrics.riskScore must be >= 0');
    } else if (metrics.riskScore > 100) {
      errors.push('metrics.riskScore must be <= 100');
    }
  }

  // Validate completionRate
  if (metrics.completionRate !== undefined) {
    if (typeof metrics.completionRate !== 'number') {
      errors.push('metrics.completionRate must be a number');
    } else if (metrics.completionRate < 0) {
      errors.push('metrics.completionRate must be >= 0');
    } else if (metrics.completionRate > 100) {
      errors.push('metrics.completionRate must be <= 100');
    }
  }

  return errors;
}

/**
 * Validate reporting object
 * @param {Object} reporting - Reporting object to validate
 * @returns {Array<string>} Array of validation errors (empty if valid)
 */
function validateReporting(reporting) {
  const errors = [];

  if (!reporting || typeof reporting !== 'object') {
    return errors; // reporting is optional
  }

  // Validate generatedAt (ISO 8601 timestamp)
  if (reporting.generatedAt !== undefined) {
    if (typeof reporting.generatedAt !== 'string') {
      errors.push('reporting.generatedAt must be a string');
    } else {
      const timestamp = new Date(reporting.generatedAt);
      if (isNaN(timestamp.getTime())) {
        errors.push('reporting.generatedAt must be a valid ISO 8601 timestamp');
      }
    }
  }

  // Validate lastReportPath
  if (reporting.lastReportPath !== undefined) {
    if (typeof reporting.lastReportPath !== 'string') {
      errors.push('reporting.lastReportPath must be a string');
    }
  }

  // Validate insights (array of strings)
  if (reporting.insights !== undefined) {
    if (!Array.isArray(reporting.insights)) {
      errors.push('reporting.insights must be an array');
    } else {
      reporting.insights.forEach((insight, index) => {
        if (typeof insight !== 'string') {
          errors.push(`reporting.insights[${index}] must be a string`);
        }
      });
    }
  }

  return errors;
}

/**
 * Main hook execution
 */
async function main() {
  if (MODE === 'off') {
    process.exit(0);
  }

  try {
    const input = await readInput();

    // Only validate Write/Edit to metadata.json files
    if (!input.tool || !['Write', 'Edit'].includes(input.tool)) {
      process.exit(0);
    }

    const filePath = input.parameters?.file_path;
    if (!filePath || !filePath.endsWith('metadata.json')) {
      process.exit(0);
    }

    // Parse content to validate
    let content = input.parameters?.content;
    if (input.tool === 'Edit') {
      // For Edit, new_string might contain JSON
      content = input.parameters?.new_string;
    }

    if (!content) {
      process.exit(0);
    }

    // Try to parse as JSON
    let metadata;
    try {
      metadata = JSON.parse(content);
    } catch (err) {
      // Not valid JSON, skip validation
      process.exit(0);
    }

    // Validate metrics
    const metricsErrors = validateMetrics(metadata.metrics);

    // Validate reporting
    const reportingErrors = validateReporting(metadata.reporting);

    const allErrors = [...metricsErrors, ...reportingErrors];

    if (allErrors.length > 0) {
      const errorMessage = `Track analytics validation failed:\n${allErrors.map((e) => `  - ${e}`).join('\n')}`;

      if (MODE === 'block') {
        console.error(errorMessage);
        process.exit(1);
      } else {
        // warn mode
        console.warn(`[WARN] ${errorMessage}`);
        process.exit(0);
      }
    }

    // Validation passed
    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] Hook execution failed: ${err.message}`);
    process.exit(0); // Fail-open (don't block on hook errors)
  }
}

main();
