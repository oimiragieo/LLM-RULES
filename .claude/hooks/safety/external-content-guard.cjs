#!/usr/bin/env node
/**
 * External Content Guard Hook (SEC-EXT-007)
 * ==========================================
 *
 * PreToolUse hook that enforces the trusted-sources.json allowlist for
 * WebFetch and Bash tool calls. Provides defense-in-depth enforcement at
 * the hook level, complementing agent-level security reviews.
 *
 * Coverage:
 * - WebFetch: blocks fetches to domains not in trusted_domains
 * - Bash: warns on `gh api` calls to untrusted orgs; blocks curl/wget to untrusted domains
 *
 * Exit codes:
 * - 0: Allow (trusted source or non-network command)
 * - 2: Block (untrusted domain or blocked pattern)
 *
 * Fail behaviour: If trusted-sources.json is missing/unreadable, defaults to
 * WARN mode (logs and allows) to avoid breaking existing workflows.
 *
 * Reference: .claude/context/reports/security/external-skill-security-protocol-2026-02-20.md
 *            Section 8.3 item 11 (SEC-EXT-007)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOOK_NAME = 'external-content-guard';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TRUSTED_SOURCES_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'trusted-sources.json');
const QUARANTINE_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'quarantine');
const AUDIT_LOG_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'external-fetch-audit.jsonl'
);

// ---------------------------------------------------------------------------
// In-process cache for trusted-sources.json (reset per process start)
// ---------------------------------------------------------------------------

let _cachedConfig = null;
let _configLoadAttempted = false;

/**
 * Load and cache the trusted-sources config.
 * Returns null if the file is missing or unreadable (caller must handle).
 *
 * @returns {{ trusted_domains: string[], trusted_organizations: string[] } | null}
 */
function loadTrustedSources() {
  if (_configLoadAttempted) return _cachedConfig;
  _configLoadAttempted = true;

  try {
    if (!fs.existsSync(TRUSTED_SOURCES_PATH)) {
      auditLog(HOOK_NAME, 'config_missing', {
        path: TRUSTED_SOURCES_PATH,
        warn: 'trusted-sources.json not found — defaulting to WARN mode',
      });
      return null;
    }

    const raw = fs.readFileSync(TRUSTED_SOURCES_PATH, 'utf-8');
    const parsed = safeParseJSON(raw);

    if (!parsed || typeof parsed !== 'object') {
      auditLog(HOOK_NAME, 'config_parse_error', {
        warn: 'trusted-sources.json could not be parsed — defaulting to WARN mode',
      });
      return null;
    }

    _cachedConfig = {
      trusted_domains: Array.isArray(parsed.trusted_domains) ? parsed.trusted_domains : [],
      trusted_organizations: Array.isArray(parsed.trusted_organizations)
        ? parsed.trusted_organizations
        : [],
    };
    return _cachedConfig;
  } catch (err) {
    auditLog(HOOK_NAME, 'config_load_error', {
      error: err.message,
      warn: 'trusted-sources.json load failed — defaulting to WARN mode',
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Quarantine helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the quarantine directory exists.
 */
function ensureQuarantineDir() {
  try {
    if (!fs.existsSync(QUARANTINE_DIR)) {
      fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
    }
  } catch (_err) {
    // Best-effort; do not block hook execution on directory creation failure
  }
}

// ---------------------------------------------------------------------------
// Audit log helpers
// ---------------------------------------------------------------------------

/**
 * Append a structured entry to the external-fetch-audit.jsonl file.
 *
 * @param {{ tool: string, url_or_command: string, domain: string|null, trust_level: string, action: string }} entry
 */
function appendAuditLog(entry) {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }) + '\n';
    fs.appendFileSync(AUDIT_LOG_PATH, line, 'utf-8');
  } catch (_err) {
    // Best-effort — audit log failure must not block tool execution
  }
}

// ---------------------------------------------------------------------------
// Domain extraction
// ---------------------------------------------------------------------------

/**
 * Extract the hostname from a URL string.
 * Returns null if the URL cannot be parsed.
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch (_err) {
    return null;
  }
}

/**
 * Check whether a domain is trusted.
 * The check uses suffix matching so that subdomain.github.com is also trusted
 * when github.com is in the list.
 *
 * @param {string} domain
 * @param {string[]} trustedDomains
 * @returns {boolean}
 */
function isDomainTrusted(domain, trustedDomains) {
  if (!domain || !Array.isArray(trustedDomains)) return false;
  const lower = domain.toLowerCase();
  return trustedDomains.some(trusted => lower === trusted || lower.endsWith('.' + trusted));
}

// ---------------------------------------------------------------------------
// WebFetch handler
// ---------------------------------------------------------------------------

/**
 * Handle a WebFetch tool call.
 * Returns { action: 'allow' | 'block', message?: string }
 *
 * @param {object} toolInput
 * @param {{ trusted_domains: string[], trusted_organizations: string[] } | null} config
 * @returns {{ action: string, message?: string }}
 */
function handleWebFetch(toolInput, config) {
  const url = toolInput.url || toolInput.URL || '';

  if (!url) {
    // No URL — allow and do not log (tool may validate further)
    return { action: 'allow' };
  }

  const domain = extractDomain(url);

  // Config missing — WARN mode: log and allow
  if (!config) {
    appendAuditLog({
      tool: 'WebFetch',
      url_or_command: url,
      domain: domain || 'unknown',
      trust_level: 'warn_mode',
      action: 'allowed_warn_mode',
    });
    auditLog(HOOK_NAME, 'warn_mode_allow', {
      tool: 'WebFetch',
      url,
      reason: 'trusted-sources.json unavailable',
    });
    return { action: 'allow' };
  }

  if (!domain) {
    // Cannot parse domain — block as untrusted
    appendAuditLog({
      tool: 'WebFetch',
      url_or_command: url,
      domain: null,
      trust_level: 'untrusted',
      action: 'blocked',
    });
    ensureQuarantineDir();
    return {
      action: 'block',
      message:
        'External fetch blocked: URL domain could not be determined. ' +
        'Verify the URL is valid and the domain is listed in .claude/config/trusted-sources.json.',
    };
  }

  if (isDomainTrusted(domain, config.trusted_domains)) {
    appendAuditLog({
      tool: 'WebFetch',
      url_or_command: url,
      domain,
      trust_level: 'trusted',
      action: 'allowed',
    });
    auditLog(HOOK_NAME, 'allow', { tool: 'WebFetch', domain, url });
    return { action: 'allow' };
  }

  // Untrusted domain — block
  appendAuditLog({
    tool: 'WebFetch',
    url_or_command: url,
    domain,
    trust_level: 'untrusted',
    action: 'blocked',
  });
  ensureQuarantineDir();
  auditLog(HOOK_NAME, 'block', { tool: 'WebFetch', domain, url });

  return {
    action: 'block',
    message:
      `External fetch blocked: domain "${domain}" is not in the trusted-sources.json allowlist. ` +
      'Add domain to .claude/config/trusted-sources.json to allow.',
  };
}

// ---------------------------------------------------------------------------
// Bash handler
// ---------------------------------------------------------------------------

/**
 * Extract the first GitHub organisation name referenced by a `gh api` call.
 * Examples handled:
 *   gh api repos/MyOrg/my-repo/...
 *   gh api /repos/MyOrg/my-repo
 *   gh api orgs/MyOrg
 *
 * @param {string} command
 * @returns {string|null}
 */
function extractGhApiOrg(command) {
  // Match patterns like: repos/ORG/... or orgs/ORG or users/ORG
  const match = command.match(/gh\s+api\s+\/?(?:repos|orgs|users)\/([^/\s"']+)/i);
  return match ? match[1] : null;
}

/**
 * Extract URLs from curl or wget commands.
 * Returns an array of URL strings found in the command.
 *
 * @param {string} command
 * @returns {string[]}
 */
function extractCurlWgetUrls(command) {
  const urls = [];
  // Match http:// and https:// URLs in the command (stop at whitespace or quotes)
  const urlPattern = /https?:\/\/[^\s"'`\\]+/gi;
  let match;
  while ((match = urlPattern.exec(command)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

/**
 * Handle a Bash tool call.
 * Returns { action: 'allow' | 'block' | 'warn', message?: string }
 *
 * @param {object} toolInput
 * @param {{ trusted_domains: string[], trusted_organizations: string[] } | null} config
 * @returns {{ action: string, message?: string }}
 */
function handleBash(toolInput, config) {
  const command = toolInput.command || '';

  if (!command || typeof command !== 'string') {
    return { action: 'allow' };
  }

  const results = [];

  // --- Check: gh api calls ---
  if (/\bgh\s+api\b/i.test(command)) {
    const org = extractGhApiOrg(command);

    if (org && config) {
      const trustedOrgs = config.trusted_organizations.map(o => o.toLowerCase());
      if (!trustedOrgs.includes(org.toLowerCase())) {
        appendAuditLog({
          tool: 'Bash',
          url_or_command: command,
          domain: `github.com/${org}`,
          trust_level: 'unverified_org',
          action: 'warned',
        });
        auditLog(HOOK_NAME, 'warn_gh_api_org', { org, command });
        results.push({
          action: 'warn',
          message:
            `gh api call references org "${org}" which is not in the trusted_organizations list ` +
            'in .claude/config/trusted-sources.json. Verify this is an intentional external call.',
        });
      } else {
        appendAuditLog({
          tool: 'Bash',
          url_or_command: command,
          domain: `github.com/${org}`,
          trust_level: 'trusted_org',
          action: 'allowed',
        });
      }
    } else if (!config) {
      // Warn-mode when config unavailable
      appendAuditLog({
        tool: 'Bash',
        url_or_command: command,
        domain: null,
        trust_level: 'warn_mode',
        action: 'allowed_warn_mode',
      });
    }
  }

  // --- Check: curl / wget calls ---
  const hasCurl = /\bcurl\b/i.test(command);
  const hasWget = /\bwget\b/i.test(command);

  if (hasCurl || hasWget) {
    const urls = extractCurlWgetUrls(command);

    for (const url of urls) {
      const domain = extractDomain(url);

      if (!config) {
        // Warn-mode
        appendAuditLog({
          tool: 'Bash',
          url_or_command: command,
          domain: domain || 'unknown',
          trust_level: 'warn_mode',
          action: 'allowed_warn_mode',
        });
        auditLog(HOOK_NAME, 'warn_mode_allow', {
          tool: 'Bash',
          url,
          reason: 'trusted-sources.json unavailable',
        });
        continue;
      }

      if (domain && isDomainTrusted(domain, config.trusted_domains)) {
        appendAuditLog({
          tool: 'Bash',
          url_or_command: command,
          domain,
          trust_level: 'trusted',
          action: 'allowed',
        });
        auditLog(HOOK_NAME, 'allow', { tool: 'Bash', domain, url });
      } else {
        appendAuditLog({
          tool: 'Bash',
          url_or_command: command,
          domain: domain || 'unknown',
          trust_level: 'untrusted',
          action: 'blocked',
        });
        ensureQuarantineDir();
        auditLog(HOOK_NAME, 'block', { tool: 'Bash', domain, command });
        results.push({
          action: 'block',
          message:
            `Bash command blocked: ${hasCurl ? 'curl' : 'wget'} to "${domain || url}" is not in the ` +
            'trusted-sources.json allowlist. Add the domain to .claude/config/trusted-sources.json to allow.',
        });
      }
    }
  }

  // Decide final action: block > warn > allow
  const blockResult = results.find(r => r.action === 'block');
  if (blockResult) return blockResult;

  const warnResult = results.find(r => r.action === 'warn');
  if (warnResult) return warnResult;

  return { action: 'allow' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);

    // Only process WebFetch and Bash calls
    if (toolName !== 'WebFetch' && toolName !== 'Bash') {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    const config = loadTrustedSources();

    let result;
    if (toolName === 'WebFetch') {
      result = handleWebFetch(toolInput, config);
    } else {
      result = handleBash(toolInput, config);
    }

    if (result.action === 'block') {
      process.stderr.write(`[${HOOK_NAME}] BLOCKED: ${result.message}\n`);
      process.exit(2);
    }

    if (result.action === 'warn' && result.message) {
      process.stderr.write(`[${HOOK_NAME}] WARN: ${result.message}\n`);
    }

    // Allow (exit 0) for 'allow' or 'warn'
    process.exit(0);
  } catch (err) {
    // Fail OPEN on unexpected errors to avoid breaking existing workflows
    auditLog(HOOK_NAME, 'error_fail_open', { error: err.message });
    if (process.env.DEBUG_HOOKS === 'true') {
      process.stderr.write(`[${HOOK_NAME}] Unexpected error (failing open): ${err.message}\n`);
    }
    process.exit(0);
  }
}

main();

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

module.exports = {
  main,
  loadTrustedSources,
  extractDomain,
  isDomainTrusted,
  handleWebFetch,
  handleBash,
  extractGhApiOrg,
  extractCurlWgetUrls,
  ensureQuarantineDir,
  appendAuditLog,
  // Reset cache for test isolation
  _resetCache: () => {
    _cachedConfig = null;
    _configLoadAttempted = false;
  },
};
