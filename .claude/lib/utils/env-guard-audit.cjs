'use strict';

/**
 * Environment Variable Guard Bypass Audit (WS4-002)
 * 
 * Logs and blocks dangerous guard overrides to prevent security bypass.
 * Implements OWASP ASI06 defense against persistent agent corruption.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const AUDIT_LOG_DIR = path.join(PROJECT_ROOT, '.claude/context/memory/audit');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'env-guard-overrides.jsonl');

// Dangerous guard env vars that can disable protections
const DANGEROUS_GUARD_VARS = [
  'CREATOR_GUARD',
  'ROUTER_BASH_GUARD',
  'PLANNER_FIRST_ENFORCEMENT',
  'SECURITY_REVIEW_ENFORCEMENT',
  'SPECIALIST_ROUTING_ENFORCEMENT',
];

/**
 * Audit a guard override
 * @param {string} guardName - Name of guard env var
 * @param {string} value - Value being set
 * @returns {{logged: boolean, auditPath: string}}
 */
function auditGuardOverride(guardName, value) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: 'GUARD_OVERRIDE',
    guard: guardName,
    value,
    pid: process.pid,
    source: 'environment',
  };

  // Ensure audit directory exists
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
  }

  // Append to audit log
  fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n');

  return {
    logged: true,
    auditPath: AUDIT_LOG_FILE,
  };
}

/**
 * Check for guard overrides and block in CI mode
 * @returns {{blocked: boolean, violations: string[]}}
 */
function checkGuardOverrides() {
  const isCI = process.env.CI === 'true';
  const violations = [];

  for (const guardVar of DANGEROUS_GUARD_VARS) {
    const value = process.env[guardVar];
    if (value === 'off' || value === 'false') {
      violations.push(`${guardVar}=${value}`);
    }
  }

  return {
    blocked: isCI && violations.length > 0,
    violations,
  };
}

/**
 * Warn when enforcement variables are disabled
 * @param {string} varName - Name of enforcement variable
 * @returns {{warned: boolean, message: string}}
 */
function warnOnEnforcementOverride(varName) {
  const value = process.env[varName];
  
  if (value === 'off') {
    const message = `WARNING: ${varName}=${value} - Security enforcement disabled`;
    process.stderr.write(`[env-guard-audit] ${message}\n`);
    
    return {
      warned: true,
      message,
    };
  }

  return {
    warned: false,
    message: '',
  };
}

module.exports = {
  auditGuardOverride,
  checkGuardOverrides,
  warnOnEnforcementOverride,
  DANGEROUS_GUARD_VARS, // Export for testing
};
