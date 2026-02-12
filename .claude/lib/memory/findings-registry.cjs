'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');

const OPEN_FINDINGS_FILE = path.join('.claude', 'context', 'memory', 'open-findings.json');
const OPEN_FINDINGS_TREND_FILE = path.join(
  '.claude',
  'context',
  'metrics',
  'open-findings-trend.jsonl'
);

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};
const DEFAULT_RESOLUTION_MIN_OVERLAP = 2;
const DEFAULT_RESOLUTION_MODE = 'lenient';
const STRICT_MIN_CONFIDENCE = 0.6;

function resolveProjectRoot(projectRoot = PROJECT_ROOT) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required');
  }
  return path.resolve(projectRoot);
}

function resolveOpenFindingsPath(projectRoot = PROJECT_ROOT) {
  const root = resolveProjectRoot(projectRoot);
  const findingsPath = path.join(root, OPEN_FINDINGS_FILE);
  const validation = validatePathWithinProject(findingsPath, root);
  if (!validation.safe) {
    throw new Error(`Invalid open findings path: ${validation.reason}`);
  }
  return validation.resolvedPath;
}

function resolveFindingsTrendPath(projectRoot = PROJECT_ROOT) {
  const root = resolveProjectRoot(projectRoot);
  const trendPath = path.join(root, OPEN_FINDINGS_TREND_FILE);
  const validation = validatePathWithinProject(trendPath, root);
  if (!validation.safe) {
    throw new Error(`Invalid open findings trend path: ${validation.reason}`);
  }
  return validation.resolvedPath;
}

function normalizeSummary(text) {
  return String(text || '')
    .replace(/^[\s\-*>#]+/, '')
    .replace(/^\d+[).:-]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSeverity(line, currentSeverity = 'unknown') {
  const text = String(line || '').toLowerCase();
  if (/\bp0\b/.test(text) || /\bcritical\b/.test(text)) return 'critical';
  if (/\bp1\b/.test(text) || /\bhigh\b/.test(text)) return 'high';
  if (/\bp2\b/.test(text) || /\bmedium\b/.test(text)) return 'medium';
  if (/\bp3\b/.test(text) || /\blow\b/.test(text)) return 'low';
  return currentSeverity;
}

function looksLikeFindingLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;

  if (/^(Issue|Finding)\s*:\s*.+/i.test(text)) return true;
  if (/^\d+[).:-]\s+.+/.test(text)) return true;
  if (/^[-*]\s+.+/.test(text)) return true;
  return false;
}

function extractFindingSummary(line) {
  const text = String(line || '').trim();
  const issueMatch = text.match(/^(?:Issue|Finding)\s*:\s*(.+)$/i);
  if (issueMatch) return normalizeSummary(issueMatch[1]);

  const numberedMatch = text.match(/^\d+[).:-]\s+(.+)$/);
  if (numberedMatch) return normalizeSummary(numberedMatch[1]);

  const bulletMatch = text.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) return normalizeSummary(bulletMatch[1]);

  return normalizeSummary(text);
}

function makeFingerprint(summary, severity = 'unknown') {
  const base = `${normalizeSummary(summary).toLowerCase()}|${String(severity || 'unknown').toLowerCase()}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
}

function hasResolutionCue(text) {
  const haystack = String(text || '').toLowerCase();
  return (
    haystack.includes('fix') ||
    haystack.includes('fixed') ||
    haystack.includes('patched') ||
    haystack.includes('resolved') ||
    haystack.includes('mitigated') ||
    haystack.includes('closed')
  );
}

function extractResolutionEvidence(completionText) {
  const text = String(completionText || '');
  const files = new Set();
  const commands = new Set();

  const fileRe = /([A-Za-z0-9_./\\-]+\.(?:cjs|mjs|js|ts|tsx|json|md|yaml|yml|sh|ps1))/g;
  let fileMatch;
  while ((fileMatch = fileRe.exec(text)) !== null) {
    files.add(fileMatch[1].replace(/\\/g, '/'));
  }

  const commandPatterns = [
    /(pnpm\s+run\s+[A-Za-z0-9:_-]+)/gi,
    /(npm\s+run\s+[A-Za-z0-9:_-]+)/gi,
    /(yarn\s+[A-Za-z0-9:_-]+)/gi,
    /(node\s+--test\s+[A-Za-z0-9_./\\:-]+)/gi,
  ];

  let commandMatch;
  for (const commandRe of commandPatterns) {
    while ((commandMatch = commandRe.exec(text)) !== null) {
      commands.add(commandMatch[1].trim());
    }
  }

  return {
    files: Array.from(files),
    commands: Array.from(commands),
  };
}

function extractFindingsFromMarkdown(markdown, options = {}) {
  const sourceReportPath = String(options.sourceReportPath || '').trim() || null;
  const lines = String(markdown || '').split(/\r?\n/);
  const findings = [];
  let currentSeverity = 'unknown';

  for (const line of lines) {
    currentSeverity = inferSeverity(line, currentSeverity);
    if (!looksLikeFindingLine(line)) continue;

    const summary = extractFindingSummary(line);
    if (!summary || summary.length < 12) continue;

    const severity = inferSeverity(line, currentSeverity);
    findings.push({
      fingerprint: makeFingerprint(summary, severity),
      summary,
      severity,
      status: 'open',
      sourceReportPath,
    });
  }

  const deduped = new Map();
  for (const finding of findings) {
    if (!deduped.has(finding.fingerprint)) {
      deduped.set(finding.fingerprint, finding);
    }
  }

  return Array.from(deduped.values());
}

function loadRegistry(projectRoot = PROJECT_ROOT) {
  const registryPath = resolveOpenFindingsPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return {
      generatedAt: new Date().toISOString(),
      findings: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { generatedAt: new Date().toISOString(), findings: [] };
    }
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    return {
      generatedAt: parsed.generatedAt || new Date().toISOString(),
      findings,
    };
  } catch (_err) {
    return { generatedAt: new Date().toISOString(), findings: [] };
  }
}

function saveRegistry(projectRoot, registry) {
  const registryPath = resolveOpenFindingsPath(projectRoot);
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  atomicWriteSync(
    registryPath,
    `${JSON.stringify({ ...registry, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
}

function upsertOpenFindings(projectRoot, findings, metadata = {}) {
  const registry = loadRegistry(projectRoot);
  const byFingerprint = new Map();
  for (const item of registry.findings) {
    const fp = String(item?.fingerprint || '').trim();
    if (fp) byFingerprint.set(fp, item);
  }

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  for (const finding of Array.isArray(findings) ? findings : []) {
    const fp = String(finding?.fingerprint || '').trim();
    if (!fp) continue;

    const existing = byFingerprint.get(fp);
    if (!existing) {
      byFingerprint.set(fp, {
        ...finding,
        status: 'open',
        createdAt: now,
        lastSeenAt: now,
        timesSeen: 1,
        taskIds: metadata.taskId ? [String(metadata.taskId)] : [],
        agentTypes: metadata.agentType ? [String(metadata.agentType)] : [],
      });
      added++;
      continue;
    }

    existing.lastSeenAt = now;
    existing.timesSeen = Number(existing.timesSeen || 0) + 1;
    existing.severity = finding.severity || existing.severity || 'unknown';
    existing.summary = finding.summary || existing.summary;
    existing.status = existing.status || 'open';

    if (metadata.taskId) {
      const taskId = String(metadata.taskId);
      const taskIds = new Set(Array.isArray(existing.taskIds) ? existing.taskIds : []);
      taskIds.add(taskId);
      existing.taskIds = Array.from(taskIds);
    }

    if (metadata.agentType) {
      const agentType = String(metadata.agentType);
      const agentTypes = new Set(Array.isArray(existing.agentTypes) ? existing.agentTypes : []);
      agentTypes.add(agentType);
      existing.agentTypes = Array.from(agentTypes);
    }

    updated++;
  }

  registry.findings = Array.from(byFingerprint.values());
  saveRegistry(projectRoot, registry);

  return {
    added,
    updated,
    total: registry.findings.length,
  };
}

function ingestReportFindings(projectRoot, reportPath, metadata = {}) {
  const root = resolveProjectRoot(projectRoot);
  const absolutePath = path.resolve(reportPath);
  const validation = validatePathWithinProject(absolutePath, root);
  if (!validation.safe) {
    throw new Error(`Unsafe report path: ${validation.reason}`);
  }

  if (!fs.existsSync(validation.resolvedPath)) {
    return { added: 0, updated: 0, parsed: 0, total: loadRegistry(root).findings.length };
  }

  const markdown = fs.readFileSync(validation.resolvedPath, 'utf8');
  const sourceReportPath = path.relative(root, validation.resolvedPath).replace(/\\/g, '/');
  const findings = extractFindingsFromMarkdown(markdown, { sourceReportPath });
  const upserted = upsertOpenFindings(root, findings, metadata);

  return {
    ...upserted,
    parsed: findings.length,
    sourceReportPath,
  };
}

function getOpenFindings(projectRoot = PROJECT_ROOT, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;
  const minSeverity = String(options.minSeverity || '').trim().toLowerCase();
  const minRank = minSeverity ? (SEVERITY_RANK[minSeverity] || 0) : 0;

  const registry = loadRegistry(projectRoot);
  const openFindings = registry.findings
    .filter(item => String(item?.status || 'open') !== 'resolved')
    .filter(item => (SEVERITY_RANK[String(item?.severity || 'unknown')] || 0) >= minRank)
    .sort((a, b) => {
      const rankDelta =
        (SEVERITY_RANK[String(b?.severity || 'unknown')] || 0) -
        (SEVERITY_RANK[String(a?.severity || 'unknown')] || 0);
      if (rankDelta !== 0) return rankDelta;
      return Date.parse(String(b?.lastSeenAt || 0)) - Date.parse(String(a?.lastSeenAt || 0));
    });

  return openFindings.slice(0, limit);
}

function resolveFindingsFromCompletion(projectRoot, completionText, metadata = {}) {
  const completion = String(completionText || '').trim();
  if (!completion || !hasResolutionCue(completion)) {
    return { resolved: 0, reviewed: 0 };
  }

  const minOverlapRaw = Number(process.env.OPEN_FINDINGS_RESOLUTION_MIN_OVERLAP);
  const minOverlap =
    Number.isFinite(minOverlapRaw) && minOverlapRaw > 0
      ? Math.floor(minOverlapRaw)
      : DEFAULT_RESOLUTION_MIN_OVERLAP;
  const resolutionMode = String(process.env.OPEN_FINDINGS_RESOLUTION_MODE || DEFAULT_RESOLUTION_MODE)
    .trim()
    .toLowerCase();

  const completionTokens = new Set(tokenize(completion));
  if (completionTokens.size === 0) {
    return { resolved: 0, reviewed: 0 };
  }

  const registry = loadRegistry(projectRoot);
  let resolved = 0;
  let reviewed = 0;
  const now = new Date().toISOString();

  const evidence = extractResolutionEvidence(completion);
  const hasEvidence = evidence.files.length > 0 || evidence.commands.length > 0;

  for (const finding of registry.findings) {
    if (String(finding?.status || 'open') === 'resolved') continue;
    reviewed++;
    const summaryTokens = tokenize(finding?.summary || '');
    let overlap = 0;
    for (const token of summaryTokens) {
      if (completionTokens.has(token)) {
        overlap++;
      }
      if (overlap >= minOverlap) break;
    }
    if (overlap < minOverlap) continue;

    const overlapScore = summaryTokens.length > 0 ? overlap / summaryTokens.length : 0;
    const evidenceScore = hasEvidence ? 0.3 : 0;
    const confidence = Math.min(1, overlapScore + evidenceScore);

    if (resolutionMode === 'strict' && (!hasEvidence || confidence < STRICT_MIN_CONFIDENCE)) {
      continue;
    }

    finding.status = 'resolved';
    finding.resolvedAt = now;
    finding.lastSeenAt = now;
    finding.resolutionConfidence = confidence;
    if (metadata.taskId) finding.resolvedByTaskId = String(metadata.taskId);
    if (metadata.agentType) finding.resolvedByAgent = String(metadata.agentType);
    finding.resolutionEvidence = evidence;
    resolved++;
  }

  if (resolved > 0) {
    saveRegistry(projectRoot, registry);
  }

  return { resolved, reviewed };
}

function getFindingsSummary(projectRoot = PROJECT_ROOT) {
  const registry = loadRegistry(projectRoot);
  const summary = {
    generatedAt: new Date().toISOString(),
    total: 0,
    open: 0,
    resolved: 0,
    bySeverity: {
      critical: { total: 0, open: 0, resolved: 0 },
      high: { total: 0, open: 0, resolved: 0 },
      medium: { total: 0, open: 0, resolved: 0 },
      low: { total: 0, open: 0, resolved: 0 },
      unknown: { total: 0, open: 0, resolved: 0 },
    },
  };

  for (const finding of registry.findings) {
    const severity = String(finding?.severity || 'unknown').toLowerCase();
    const bucket = Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)
      ? severity
      : 'unknown';
    const status = String(finding?.status || 'open').toLowerCase() === 'resolved' ? 'resolved' : 'open';

    summary.total++;
    summary[status]++;
    summary.bySeverity[bucket].total++;
    summary.bySeverity[bucket][status]++;
  }

  return summary;
}

function recordFindingsTrendSnapshot(projectRoot = PROJECT_ROOT, source = 'unknown') {
  const root = resolveProjectRoot(projectRoot);
  const summary = getFindingsSummary(root);
  const trendPath = resolveFindingsTrendPath(root);
  fs.mkdirSync(path.dirname(trendPath), { recursive: true });

  const snapshot = {
    timestamp: new Date().toISOString(),
    source: String(source || 'unknown'),
    total: Number(summary.total || 0),
    open: Number(summary.open || 0),
    resolved: Number(summary.resolved || 0),
    openCritical: Number(summary.bySeverity?.critical?.open || 0),
    openHigh: Number(summary.bySeverity?.high?.open || 0),
  };

  fs.appendFileSync(trendPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  return snapshot;
}

function readFindingsTrend(projectRoot = PROJECT_ROOT, options = {}) {
  const daysRaw = Number(options.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const trendPath = resolveFindingsTrendPath(projectRoot);
  if (!fs.existsSync(trendPath)) return [];

  const lines = fs
    .readFileSync(trendPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const results = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const ts = Date.parse(String(parsed?.timestamp || ''));
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      results.push(parsed);
    } catch (_err) {
      // Skip malformed telemetry lines.
    }
  }

  return results;
}

function summarizeFindingsTrend(projectRoot = PROJECT_ROOT, options = {}) {
  const samples = readFindingsTrend(projectRoot, options);
  if (samples.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sampleCount: 0,
      openMin: 0,
      openMax: 0,
      openAvg: 0,
      openDelta: 0,
    };
  }

  const opens = samples.map(item => Number(item?.open || 0));
  const openMin = Math.min(...opens);
  const openMax = Math.max(...opens);
  const openAvg = opens.reduce((sum, value) => sum + value, 0) / opens.length;
  const openDelta = opens[opens.length - 1] - opens[0];

  return {
    generatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    openMin,
    openMax,
    openAvg,
    openDelta,
  };
}

module.exports = {
  OPEN_FINDINGS_FILE,
  OPEN_FINDINGS_TREND_FILE,
  SEVERITY_RANK,
  resolveOpenFindingsPath,
  resolveFindingsTrendPath,
  extractFindingsFromMarkdown,
  upsertOpenFindings,
  ingestReportFindings,
  getOpenFindings,
  getFindingsSummary,
  readFindingsTrend,
  recordFindingsTrendSnapshot,
  summarizeFindingsTrend,
  resolveFindingsFromCompletion,
  makeFingerprint,
  normalizeSummary,
  tokenize,
  hasResolutionCue,
  extractResolutionEvidence,
  DEFAULT_RESOLUTION_MIN_OVERLAP,
  DEFAULT_RESOLUTION_MODE,
  STRICT_MIN_CONFIDENCE,
};
