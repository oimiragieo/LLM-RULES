'use strict';

const fs = require('fs');
const path = require('path');
const { checkInstallation, runMedusaScan } = require(path.join(__dirname, 'cli-wrapper.cjs'));
const { generateSummary } = require(path.join(__dirname, 'finding-formatter.cjs'));

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'security-review-medusa-scan-2026-02-17.md'
);

const TARGETS = [
  path.join(PROJECT_ROOT, '.claude', 'hooks'),
  path.join(PROJECT_ROOT, '.claude', 'lib'),
  path.join(PROJECT_ROOT, '.claude', 'skills', 'medusa-security', 'scripts'),
  path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md'),
];

const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.json', '.md']);

const CHECKS = [
  {
    id: 'shell_true',
    title: 'Potential shell injection surface (`shell: true`)',
    regex: /shell\s*:\s*true/gm,
    severity: 'HIGH',
  },
  {
    id: 'raw_json_parse',
    title: 'Raw `JSON.parse` usage (prefer `safeParseJSON`)',
    regex: /JSON\.parse\s*\(/gm,
    severity: 'MEDIUM',
  },
  {
    id: 'exec_sync',
    title: 'Blocking shell execution (`execSync`)',
    regex: /\bexecSync\s*\(/gm,
    severity: 'MEDIUM',
  },
  {
    id: 'exec_async',
    title: 'Shell command execution (`exec`)',
    regex: /\bexec\s*\(/gm,
    severity: 'MEDIUM',
  },
];

function toPosixPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

function walkFiles(startPath, out = []) {
  if (!fs.existsSync(startPath)) {
    return out;
  }
  const stat = fs.statSync(startPath);
  if (stat.isFile()) {
    if (shouldScanFile(startPath)) {
      out.push(startPath);
    }
    return out;
  }
  if (!stat.isDirectory()) {
    return out;
  }
  for (const entry of fs.readdirSync(startPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const abs = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
    } else if (entry.isFile() && shouldScanFile(abs)) {
      out.push(abs);
    }
  }
  return out;
}

function findLineNumber(content, matchIndex) {
  return content.slice(0, matchIndex).split('\n').length;
}

function runManualChecks() {
  const files = [];
  for (const target of TARGETS) {
    walkFiles(target, files);
  }

  const findings = [];
  for (const filePath of files) {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const check of CHECKS) {
      check.regex.lastIndex = 0;
      let match = check.regex.exec(content);
      while (match) {
        findings.push({
          ruleId: `MANUAL-${check.id.toUpperCase()}`,
          severity: check.severity,
          category: 'general',
          message: check.title,
          file: toPosixPath(filePath),
          line: findLineNumber(content, match.index),
          column: 1,
        });
        if (findings.length >= 200) {
          return { findings, filesScanned: files.length };
        }
        match = check.regex.exec(content);
      }
    }
  }

  return { findings, filesScanned: files.length };
}

function severityCounts(findings) {
  return findings.reduce(
    (acc, finding) => {
      const sev = finding.severity || 'MEDIUM';
      if (acc[sev] !== undefined) {
        acc[sev] += 1;
      }
      return acc;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  );
}

function topFindings(findings, limit = 20) {
  return findings.slice(0, limit);
}

function buildReport(scanMeta, medusaFindings, manualFindings, filesScanned) {
  const medusaSummary = generateSummary(medusaFindings);
  const manualSummary = generateSummary(manualFindings);
  const totalCounts = severityCounts([...medusaFindings, ...manualFindings]);
  const lines = [];

  lines.push('<!-- Agent: security-architect | Task: #7 | Session: 2026-02-17 -->');
  lines.push('');
  lines.push('# Security Review: Medusa Scan');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Project: \`${PROJECT_ROOT.replace(/\\/g, '/')}\``);
  lines.push(`- Medusa Installed: **${scanMeta.installed ? 'yes' : 'no'}**`);
  lines.push(`- Medusa Version: **${scanMeta.version || 'n/a'}**`);
  if (scanMeta.error) {
    lines.push(`- Medusa Error: \`${scanMeta.error.replace(/\s+/g, ' ').trim()}\``);
  }
  lines.push(`- Files Scanned (manual checks): **${filesScanned}**`);
  lines.push('');

  lines.push('## Severity Breakdown');
  lines.push('');
  lines.push('| Source | Critical | High | Medium | Low | Total |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  lines.push(
    `| Medusa | ${medusaSummary.critical} | ${medusaSummary.high} | ${medusaSummary.medium} | ${medusaSummary.low} | ${medusaSummary.total} |`
  );
  lines.push(
    `| Manual | ${manualSummary.critical} | ${manualSummary.high} | ${manualSummary.medium} | ${manualSummary.low} | ${manualSummary.total} |`
  );
  lines.push(
    `| Combined | ${totalCounts.CRITICAL} | ${totalCounts.HIGH} | ${totalCounts.MEDIUM} | ${totalCounts.LOW} | ${medusaFindings.length + manualFindings.length} |`
  );
  lines.push('');

  lines.push('## Top Findings');
  lines.push('');
  lines.push('| Severity | Rule | File | Line | Message |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const finding of topFindings([...medusaFindings, ...manualFindings])) {
    const msg = (finding.message || '').replace(/\|/g, '\\|');
    lines.push(
      `| ${finding.severity || 'MEDIUM'} | ${finding.ruleId || 'N/A'} | ${finding.file || 'N/A'} | ${finding.line || 0} | ${msg} |`
    );
  }
  if (medusaFindings.length + manualFindings.length === 0) {
    lines.push('| LOW | NONE | n/a | 0 | No findings detected |');
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- This review intentionally avoids recursive `Glob` calls to prevent ripgrep timeout failures.'
  );
  lines.push(
    '- Manual checks cover shell execution risk and unsafe parsing patterns in high-value framework paths.'
  );
  lines.push('');

  return lines.join('\n');
}

function writeReport(content) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, content, 'utf8');
}

function run() {
  const installMeta = checkInstallation();
  let medusaFindings = [];

  if (installMeta.installed) {
    try {
      const scan = runMedusaScan('.', { format: 'sarif', failOn: 'high' });
      medusaFindings = Array.isArray(scan.findings) ? scan.findings : [];
    } catch (err) {
      installMeta.error = err && err.message ? err.message : 'scan failed';
    }
  }

  const manual = runManualChecks();
  const report = buildReport(installMeta, medusaFindings, manual.findings, manual.filesScanned);
  writeReport(report);

  process.stdout.write(`${REPORT_PATH}\n`);
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  runManualChecks,
  buildReport,
};
