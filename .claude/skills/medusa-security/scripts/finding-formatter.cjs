'use strict';

// Severity weights for security score calculation
const SEVERITY_WEIGHTS = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 1,
};

// Severity badge icons for formatted output
const SEVERITY_BADGES = {
  CRITICAL: '[CRITICAL]',
  HIGH: '[HIGH]',
  MEDIUM: '[MEDIUM]',
  LOW: '[LOW]',
};

/**
 * OWASP Agentic AI Top 10 mapping by Medusa category.
 */
const OWASP_AGENTIC_MAP = {
  prompt_injection: { id: 'ASI01', name: 'Agent Goal Hijacking' },
  mcp_security: { id: 'ASI02', name: 'Tool Misuse' },
  ai_security: { id: 'ASI01', name: 'Agent Goal Hijacking' },
  memory_poisoning: { id: 'ASI06', name: 'Memory & Context Poisoning' },
  tool_abuse: { id: 'ASI02', name: 'Tool Misuse' },
  data_exfiltration: { id: 'ASI04', name: 'Sensitive Information Disclosure' },
  privilege_escalation: { id: 'ASI05', name: 'Privilege Escalation' },
};

/**
 * OWASP Top 10 (2021) mapping by Medusa category.
 */
const OWASP_TOP10_MAP = {
  secrets: { id: 'A02', name: 'Cryptographic Failures' },
  injection: { id: 'A03', name: 'Injection' },
  authentication: { id: 'A07', name: 'Identification and Authentication Failures' },
  xss: { id: 'A03', name: 'Injection' },
  cryptography: { id: 'A02', name: 'Cryptographic Failures' },
  access_control: { id: 'A01', name: 'Broken Access Control' },
  misconfiguration: { id: 'A05', name: 'Security Misconfiguration' },
  ssrf: { id: 'A10', name: 'Server-Side Request Forgery' },
};

/**
 * Agent-studio remediation mapping by category.
 */
const REMEDIATION_MAP = {
  prompt_injection: {
    skill: 'security-architect',
    agent: 'security-architect',
    description: 'Use security-architect skill for prompt injection review and input sanitization',
  },
  mcp_security: {
    skill: 'security-architect',
    agent: 'security-architect',
    description: 'Use security-architect to audit MCP tool descriptions for hidden instructions',
  },
  ai_security: {
    skill: 'security-architect',
    agent: 'security-architect',
    description: 'Use security-architect for AI security patterns and OWASP Agentic AI review',
  },
  secrets: {
    skill: 'auth-security-expert',
    agent: 'security-architect',
    description: 'Remove hardcoded secrets; use environment variables or secret managers',
  },
  injection: {
    skill: 'security-architect',
    agent: 'developer',
    description: 'Use parameterized queries; validate and sanitize all inputs',
  },
  authentication: {
    skill: 'auth-security-expert',
    agent: 'security-architect',
    description: 'Review authentication flow; implement MFA and secure session management',
  },
  xss: {
    skill: 'security-architect',
    agent: 'developer',
    description: 'Sanitize output; use CSP headers; encode user-generated content',
  },
  general: {
    skill: 'security-architect',
    agent: 'code-reviewer',
    description: 'General security review recommended',
  },
};

/**
 * Format a single finding into a human-readable string.
 * @param {object} finding - Standardized finding object
 * @returns {string} Formatted finding string
 */
function formatFinding(finding) {
  const badge = SEVERITY_BADGES[finding.severity] || '[UNKNOWN]';
  const location = `${finding.file}:${finding.line}:${finding.column}`;
  return `${badge} ${finding.ruleId} at ${location}\n  ${finding.message}`;
}

/**
 * Map a finding to OWASP Agentic AI Top 10 category.
 * @param {object} finding - Standardized finding object
 * @returns {{ id: string, name: string }} OWASP Agentic mapping
 */
function mapToOwaspAgentic(finding) {
  const category = finding.category || 'general';
  return OWASP_AGENTIC_MAP[category] || { id: 'ASI01', name: 'Agent Goal Hijacking' };
}

/**
 * Map a finding to OWASP Top 10 (2021) category.
 * @param {object} finding - Standardized finding object
 * @returns {{ id: string, name: string }} OWASP Top 10 mapping
 */
function mapToOwaspTop10(finding) {
  const category = finding.category || 'general';
  return OWASP_TOP10_MAP[category] || { id: 'A04', name: 'Insecure Design' };
}

/**
 * Generate a markdown report from findings.
 * @param {Array} findings - Array of standardized findings
 * @returns {string} Markdown report
 */
function generateMarkdownReport(findings) {
  const summary = generateSummary(findings);
  const lines = [];

  lines.push('# Medusa Security Scan Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total Findings | ${summary.total} |`);
  lines.push(`| Critical | ${summary.critical} |`);
  lines.push(`| High | ${summary.high} |`);
  lines.push(`| Medium | ${summary.medium} |`);
  lines.push(`| Low | ${summary.low} |`);
  lines.push(`| Security Score | ${summary.securityScore}/100 |`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No findings detected.');
    return lines.join('\n');
  }

  lines.push('## Findings');
  lines.push('');
  lines.push('| Severity | Rule | File | Line | Message |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const finding of findings) {
    const sev = finding.severity || 'MEDIUM';
    const rule = finding.ruleId || 'N/A';
    const file = finding.file || 'N/A';
    const line = finding.line || 0;
    const msg = (finding.message || '').replace(/\|/g, '\\|');
    lines.push(`| ${sev} | ${rule} | ${file} | ${line} | ${msg} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a summary object from findings.
 * @param {Array} findings - Array of standardized findings
 * @returns {{ total: number, critical: number, high: number, medium: number, low: number, securityScore: number }}
 */
function generateSummary(findings) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  for (const finding of findings) {
    const sev = finding.severity || 'MEDIUM';
    if (counts[sev] !== undefined) {
      counts[sev]++;
    } else {
      counts.MEDIUM++;
    }
  }

  const total = findings.length;
  const maxPenalty = 100;
  let penalty = 0;
  penalty += counts.CRITICAL * SEVERITY_WEIGHTS.CRITICAL;
  penalty += counts.HIGH * SEVERITY_WEIGHTS.HIGH;
  penalty += counts.MEDIUM * SEVERITY_WEIGHTS.MEDIUM;
  penalty += counts.LOW * SEVERITY_WEIGHTS.LOW;

  const securityScore = Math.max(0, Math.min(100, maxPenalty - penalty));

  return {
    total,
    critical: counts.CRITICAL,
    high: counts.HIGH,
    medium: counts.MEDIUM,
    low: counts.LOW,
    securityScore,
  };
}

/**
 * Map a finding to agent-studio remediation references.
 * @param {object} finding - Standardized finding object
 * @returns {{ skill?: string, agent?: string, description: string }}
 */
function mapToRemediation(finding) {
  const category = finding.category || 'general';
  return REMEDIATION_MAP[category] || REMEDIATION_MAP.general;
}

module.exports = {
  formatFinding,
  mapToOwaspAgentic,
  mapToOwaspTop10,
  generateMarkdownReport,
  generateSummary,
  mapToRemediation,
  SEVERITY_WEIGHTS,
  SEVERITY_BADGES,
  OWASP_AGENTIC_MAP,
  OWASP_TOP10_MAP,
  REMEDIATION_MAP,
};
