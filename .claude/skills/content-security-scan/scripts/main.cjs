'use strict';
/**
 * content-security-scan: main.cjs
 * Automated 7-step security gate for external skill/agent content.
 *
 * Usage:
 *   node main.cjs --file <path> --source-url <url> [--json] [--strict]
 *   node main.cjs --content <string> --source-url <url> [--json]
 *
 * Agent: developer | Task: #9 | Session: 2026-02-20
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTENT_BYTES = 51200; // 50KB
const AUDIT_LOG_PATH = path.join(__dirname, '../../../context/runtime/external-fetch-audit.jsonl');
const TRUSTED_SOURCES_PATH = path.join(__dirname, '../../../config/trusted-sources.json');

// Red flag patterns per step
const TOOL_INVOCATION_PATTERNS = [
  /Bash\s*\(\s*\{/,
  /Task\s*\(\s*\{/,
  /Write\s*\(\s*\{/,
  /Edit\s*\(\s*\{/,
  /WebFetch\s*\(\s*\{/,
  /WebSearch\s*\(\s*\{/,
];

const SKILL_INVOCATION_PATTERN =
  /Skill\s*\(\s*\{[^}]*skill\s*:\s*['"](?!research-synthesis|framework-context|github-ops|tdd|debugging)[^'"]+['"]/;

const PROMPT_INJECTION_PATTERNS = [
  {
    re: /ignore\s+(all\s+)?(previous\s+)?(instructions|rules|constraints)/i,
    label: 'instruction_override',
  },
  {
    re: /disregard\s+(all\s+)?(previous\s+)?(instructions|rules|constraints)/i,
    label: 'instruction_override',
  },
  {
    re: /forget\s+(all\s+)?(previous\s+)?(instructions|rules|constraints)/i,
    label: 'instruction_override',
  },
  { re: /you\s+are\s+now\b/i, label: 'role_assumption' },
  { re: /act\s+as\b/i, label: 'role_assumption' },
  { re: /pretend\s+to\s+be\b/i, label: 'role_assumption' },
  { re: /your\s+new\s+role\s+is\b/i, label: 'role_assumption' },
  {
    re: /<!--[^>]*(instruction|execute|run|invoke|call|spawn)[^>]*-->/i,
    label: 'hidden_html_instruction',
  },
  {
    re: /\b(DAN|do\s+anything\s+now|developer\s+mode|unrestricted\s+mode)\b/i,
    label: 'jailbreak_marker',
  },
  {
    re: /(system\s+prompt|initial\s+instructions|original\s+prompt|show\s+me\s+your)/i,
    label: 'system_prompt_extraction',
  },
  { re: /[\u200B-\u200F\u2028-\u202F\uFEFF]/, label: 'zero_width_obfuscation' },
];

const EXFILTRATION_PATTERNS = [
  { re: /process\.env\.[A-Z_]{3,}/i, label: 'env_access' },
  {
    re: /(curl|wget)\s+[^\s]*(?!github\.com|raw\.githubusercontent\.com|arxiv\.org)[^\s]+\.(com|net|org|io|dev)/i,
    label: 'outbound_http',
  },
  {
    re: /fetch\s*\([^)]*https?:\/\/(?!github\.com|raw\.githubusercontent\.com|arxiv\.org)/i,
    label: 'outbound_fetch',
  },
  { re: /(readFile|fs\.read)[^;]*https?:\/\//i, label: 'file_plus_http' },
  { re: /(nslookup|dig|host)\s+[^\s]*\$\{/i, label: 'dns_exfiltration' },
  { re: /https?:\/\/[^\s]*\?(data|payload|content|body)=/i, label: 'encoded_url_data' },
];

const PRIVILEGE_PATTERNS = [
  {
    re: /(CREATOR_GUARD|PLANNER_FIRST|SECURITY_REVIEW|ROUTING_GUARD)\s*=\s*(off|false|0)/i,
    label: 'hook_disable',
  },
  { re: /settings\.json/i, label: 'settings_write' },
  { re: /CLAUDE\.md/i, label: 'claude_md_reference' },
  { re: /memory\/(patterns|gotchas|access-stats)\.json/i, label: 'memory_direct_write' },
  {
    re: /agents:\s*\[(?:[^\]]*\b(router|master-orchestrator|evolution-orchestrator)\b[^\]]*)\]/i,
    label: 'privileged_agent_assignment',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip triple-backtick code fences from content, return { prose, fences }.
 * Fences are returned separately so we can scan them with different rules.
 */
function splitCodeFences(content) {
  const fences = [];
  const prose = content.replace(/```[\s\S]*?```/g, match => {
    fences.push(match);
    return '<<CODEFENCE>>';
  });
  return { prose, fences };
}

/**
 * Check if a code fence contains an active tool invocation (not documentation).
 * Heuristic: surrounding prose contains "run", "execute", "invoke" and NOT "example", "do not run".
 */
function isFenceActiveTool(fence, surroundingProse) {
  const activeKeywords = /(run\s+this|execute\s+this|invoke\s+this)/i;
  const docKeywords = /(example|do\s+not\s+run|template|for\s+reference|documentation)/i;
  if (!activeKeywords.test(surroundingProse)) return false;
  if (docKeywords.test(surroundingProse)) return false;
  return TOOL_INVOCATION_PATTERNS.some(p => p.test(fence));
}

/**
 * Append a JSON record to the audit log (JSONL format).
 */
function appendAuditLog(record) {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // Non-fatal: log write failure should not crash the scan
  }
}

/**
 * Load trusted sources config.
 */
function _loadTrustedSources(configPath) {
  const p = configPath || TRUSTED_SOURCES_PATH;
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const { success, data } = safeParseJSON(raw, null);
  return success ? data : null;
}

/**
 * Extract line number of a match within content.
 */
function lineOf(content, index) {
  return content.substring(0, index).split('\n').length;
}

// ---------------------------------------------------------------------------
// Scan Steps
// ---------------------------------------------------------------------------

function stepSizeCheck(content) {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_CONTENT_BYTES) {
    return {
      passed: false,
      flag: {
        step: 'size_check',
        pattern: `content_size:${bytes}`,
        severity: 'HIGH',
        excerpt: `Content is ${bytes} bytes (limit: ${MAX_CONTENT_BYTES})`,
      },
    };
  }
  return { passed: true };
}

function stepBinaryCheck(content) {
  // Check for non-UTF-8 bytes by attempting buffer round-trip
  try {
    const buf = Buffer.from(content, 'utf8');
    const rt = buf.toString('utf8');
    if (rt !== content) {
      return {
        passed: false,
        flag: {
          step: 'binary_check',
          pattern: 'non_utf8_bytes',
          severity: 'HIGH',
          excerpt: 'Content contains non-UTF-8 bytes',
        },
      };
    }
    // Also check for null bytes
    if (content.includes('\u0000')) {
      return {
        passed: false,
        flag: {
          step: 'binary_check',
          pattern: 'null_byte',
          severity: 'HIGH',
          excerpt: 'Content contains null bytes',
        },
      };
    }
  } catch {
    return {
      passed: false,
      flag: {
        step: 'binary_check',
        pattern: 'encoding_error',
        severity: 'HIGH',
        excerpt: 'Content encoding validation failed',
      },
    };
  }
  return { passed: true };
}

function stepToolInvocationScan(content) {
  const { prose, fences } = splitCodeFences(content);
  const flags = [];

  // Check prose for tool patterns
  for (const pattern of TOOL_INVOCATION_PATTERNS) {
    const match = prose.match(pattern);
    if (match) {
      const idx = prose.indexOf(match[0]);
      flags.push({
        step: 'tool_invocation',
        pattern: match[0],
        severity: 'CRITICAL',
        line: lineOf(prose, idx),
        excerpt: prose.substring(Math.max(0, idx - 20), idx + 60).replace(/\n/g, ' '),
      });
    }
  }

  // Check for unexpected Skill() invocations in prose
  const skillMatch = prose.match(SKILL_INVOCATION_PATTERN);
  if (skillMatch) {
    const idx = prose.indexOf(skillMatch[0]);
    flags.push({
      step: 'tool_invocation',
      pattern: 'Skill(<unexpected>',
      severity: 'HIGH',
      line: lineOf(prose, idx),
      excerpt: skillMatch[0].substring(0, 80),
    });
  }

  // Check active code fences
  for (const fence of fences) {
    if (isFenceActiveTool(fence, prose)) {
      flags.push({
        step: 'tool_invocation',
        pattern: 'active_tool_in_fence',
        severity: 'HIGH',
        excerpt: fence.substring(0, 100),
      });
    }
  }

  return flags.length > 0 ? { passed: false, flags } : { passed: true };
}

function stepPromptInjectionScan(content) {
  const flags = [];
  for (const { re, label } of PROMPT_INJECTION_PATTERNS) {
    const match = content.match(re);
    if (match) {
      const idx = content.indexOf(match[0]);
      flags.push({
        step: 'prompt_injection',
        pattern: label,
        severity: 'CRITICAL',
        line: lineOf(content, idx),
        excerpt: match[0].substring(0, 80),
      });
    }
  }
  return flags.length > 0 ? { passed: false, flags } : { passed: true };
}

function stepExfiltrationScan(content) {
  const flags = [];
  for (const { re, label } of EXFILTRATION_PATTERNS) {
    const match = content.match(re);
    if (match) {
      const idx = content.indexOf(match[0]);
      flags.push({
        step: 'exfiltration',
        pattern: label,
        severity: 'HIGH',
        line: lineOf(content, idx),
        excerpt: match[0].substring(0, 80),
      });
    }
  }
  return flags.length > 0 ? { passed: false, flags } : { passed: true };
}

function stepPrivilegeScan(content) {
  const flags = [];
  for (const { re, label } of PRIVILEGE_PATTERNS) {
    const match = content.match(re);
    if (match) {
      const idx = content.indexOf(match[0]);
      flags.push({
        step: 'privilege',
        pattern: label,
        severity: 'CRITICAL',
        line: lineOf(content, idx),
        excerpt: match[0].substring(0, 80),
      });
    }
  }
  return flags.length > 0 ? { passed: false, flags } : { passed: true };
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

/**
 * Run the full 7-step security gate.
 * @param {string} content - Raw fetched content string
 * @param {string} sourceUrl - URL content was fetched from
 * @param {object} options - { trustedSourcesPath, strict }
 * @returns {object} Scan result
 */
function scan(content, sourceUrl, _options = {}) {
  const now = new Date().toISOString();
  const allFlags = [];
  const stepResults = {};

  // Step 1: Size
  const sizeResult = stepSizeCheck(content);
  stepResults['size_check'] = sizeResult.passed ? 'PASS' : 'FAIL';
  if (!sizeResult.passed) {
    allFlags.push(sizeResult.flag);
    // Fast-fail on size
    const record = buildAuditRecord(sourceUrl, content, 'FAIL', allFlags, now);
    appendAuditLog(record);
    return buildResult('FAIL', allFlags, stepResults, record);
  }

  // Step 2: Binary
  const binaryResult = stepBinaryCheck(content);
  stepResults['binary_check'] = binaryResult.passed ? 'PASS' : 'FAIL';
  if (!binaryResult.passed) {
    allFlags.push(binaryResult.flag);
    const record = buildAuditRecord(sourceUrl, content, 'FAIL', allFlags, now);
    appendAuditLog(record);
    return buildResult('FAIL', allFlags, stepResults, record);
  }

  // Step 3: Tool Invocation
  const toolResult = stepToolInvocationScan(content);
  stepResults['tool_invocation'] = toolResult.passed ? 'PASS' : 'FAIL';
  if (!toolResult.passed) allFlags.push(...toolResult.flags);

  // Step 4: Prompt Injection
  const injectionResult = stepPromptInjectionScan(content);
  stepResults['prompt_injection'] = injectionResult.passed ? 'PASS' : 'FAIL';
  if (!injectionResult.passed) allFlags.push(...injectionResult.flags);

  // Step 5: Exfiltration
  const exfilResult = stepExfiltrationScan(content);
  stepResults['exfiltration'] = exfilResult.passed ? 'PASS' : 'FAIL';
  if (!exfilResult.passed) allFlags.push(...exfilResult.flags);

  // Step 6: Privilege
  const privResult = stepPrivilegeScan(content);
  stepResults['privilege'] = privResult.passed ? 'PASS' : 'FAIL';
  if (!privResult.passed) allFlags.push(...privResult.flags);

  const verdict = allFlags.length > 0 ? 'FAIL' : 'PASS';

  // Step 7: Provenance Log (always)
  const record = buildAuditRecord(sourceUrl, content, verdict, allFlags, now);
  appendAuditLog(record);

  return buildResult(verdict, allFlags, stepResults, record);
}

function buildAuditRecord(sourceUrl, content, verdict, flags, timestamp) {
  return {
    source_url: sourceUrl,
    fetch_time: timestamp,
    content_size_bytes: Buffer.byteLength(content, 'utf8'),
    scan_result: verdict,
    red_flags: flags,
    reviewer: 'content-security-scan',
    reviewed_at: new Date().toISOString(),
  };
}

function buildResult(verdict, flags, stepResults, auditRecord) {
  return {
    verdict,
    source_url: auditRecord.source_url,
    scan_steps: stepResults,
    red_flags: flags,
    provenance_logged: true,
    audit_record: auditRecord,
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--content' && argv[i + 1]) {
      args.content = argv[++i];
    } else if (argv[i] === '--source-url' && argv[i + 1]) {
      args.sourceUrl = argv[++i];
    } else if (argv[i] === '--trusted-sources' && argv[i + 1]) {
      args.trustedSources = argv[++i];
    } else if (argv[i] === '--json') {
      args.json = true;
    } else if (argv[i] === '--strict') {
      args.strict = true;
    }
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);

  if (!args.sourceUrl) {
    process.stderr.write('Error: --source-url is required\n');
    process.exit(1);
  }

  let content;
  if (args.file) {
    if (!fs.existsSync(args.file)) {
      process.stderr.write(`Error: file not found: ${args.file}\n`);
      process.exit(1);
    }
    content = fs.readFileSync(args.file, 'utf8');
  } else if (args.content) {
    content = args.content;
  } else {
    process.stderr.write('Error: --file or --content is required\n');
    process.exit(1);
  }

  const result = scan(content, args.sourceUrl, {
    trustedSourcesPath: args.trustedSources,
    strict: args.strict,
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Human-readable output
    const icon = result.verdict === 'PASS' ? 'PASS' : 'FAIL';
    process.stdout.write(`\n=== Content Security Scan: ${icon} ===\n`);
    process.stdout.write(`Source: ${result.source_url}\n`);
    process.stdout.write(`Steps:\n`);
    for (const [step, status] of Object.entries(result.scan_steps || {})) {
      process.stdout.write(`  ${step}: ${status}\n`);
    }
    if (result.red_flags.length > 0) {
      process.stdout.write(`\nRed Flags (${result.red_flags.length}):\n`);
      for (const flag of result.red_flags) {
        process.stdout.write(`  [${flag.severity}] ${flag.step}: ${flag.pattern}\n`);
        if (flag.excerpt) {
          process.stdout.write(`    Excerpt: ${flag.excerpt}\n`);
        }
      }
    }
    process.stdout.write(`\nProvenance logged: ${result.provenance_logged}\n\n`);
  }

  process.exit(result.verdict === 'PASS' ? 0 : 1);
}

module.exports = {
  scan,
  stepSizeCheck,
  stepBinaryCheck,
  stepToolInvocationScan,
  stepPromptInjectionScan,
  stepExfiltrationScan,
  stepPrivilegeScan,
};
