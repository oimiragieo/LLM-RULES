#!/usr/bin/env node
'use strict';

/**
 * Audit Artifact Recency Hook
 *
 * Type: session-start
 * Purpose: Audit skills and agents for verification and staleness (6-month limit).
 * Trigger: Session start.
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const AGENT_DIR_ALLOWLIST = new Set(['core', 'domain', 'specialized', 'orchestrators']);

function walk(dir, extension, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, extension, out);
    } else if (entry.name.endsWith(extension)) {
      out.push(full);
    }
  }
  return out;
}

function isLikelyIso8601(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(String(value || '').trim());
}

function toLabel(type, name) {
  return `${type === 'agent' ? '[AGENT]' : '[SKILL]'} ${name}`;
}

function collectSkillFiles(projectRoot) {
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  return walk(skillsDir, 'SKILL.md').filter(file => {
    const rel = path.relative(skillsDir, file).replace(/\\/g, '/');
    if (rel.startsWith('_archive/') || rel.includes('/_archive/')) return false;
    return true;
  });
}

function collectAgentFiles(projectRoot) {
  const agentsDir = path.join(projectRoot, '.claude', 'agents');
  return walk(agentsDir, '.md').filter(file => {
    const rel = path.relative(agentsDir, file).replace(/\\/g, '/');
    const topLevel = rel.split('/')[0];
    if (!AGENT_DIR_ALLOWLIST.has(topLevel)) return false;
    if (rel.includes('/_archive/') || rel.includes('/archive/') || rel.includes('/dead/'))
      return false;
    if (path.basename(file).toLowerCase() === 'readme.md') return false;
    return true;
  });
}

function parseFrontmatterValue(content, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function writeRuntimeArtifact(projectRoot, payload) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'stale-artifacts.json'), JSON.stringify(payload, null, 2));
}

function auditArtifacts(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const jsonMode = options.json === true;
  const writeRuntimeFile = options.writeRuntimeFile === true;
  const skillFiles = collectSkillFiles(projectRoot);
  const agentFiles = collectAgentFiles(projectRoot);

  const unverified = [];
  const stale = [];
  const now = Date.now();

  const allFiles = [
    ...skillFiles.map(file => ({ file, type: 'skill' })),
    ...agentFiles.map(file => ({ file, type: 'agent' })),
  ];

  for (const artifact of allFiles) {
    try {
      const file = artifact.file;
      const content = fs.readFileSync(file, 'utf8');
      const name =
        artifact.type === 'agent' ? path.basename(file, '.md') : path.basename(path.dirname(file));
      const verified = parseFrontmatterValue(content, 'verified') === 'true';
      const rawLastVerified = parseFrontmatterValue(content, 'lastVerifiedAt');
      const label = toLabel(artifact.type, name);
      const baseEntry = {
        type: artifact.type,
        name,
        label,
        path: path.relative(projectRoot, file).replace(/\\/g, '/'),
      };

      if (verified !== true) {
        unverified.push({
          ...baseEntry,
          status: 'unverified',
          lastVerifiedAt: rawLastVerified || null,
        });
      } else if (rawLastVerified) {
        if (!isLikelyIso8601(rawLastVerified)) {
          stale.push({ ...baseEntry, status: 'stale', lastVerifiedAt: rawLastVerified });
        } else {
          const lastVerified = new Date(rawLastVerified).getTime();
          if (isNaN(lastVerified) || now - lastVerified > SIX_MONTHS_MS) {
            stale.push({ ...baseEntry, status: 'stale', lastVerifiedAt: rawLastVerified });
          }
        }
      } else {
        stale.push({ ...baseEntry, status: 'stale', lastVerifiedAt: null });
      }
    } catch (_err) {
      // Skip files we can't read
    }
  }

  const result = {
    timestamp: new Date().toISOString(),
    unverified,
    stale,
  };

  if (writeRuntimeFile) {
    writeRuntimeArtifact(projectRoot, result);
  }

  if (jsonMode) {
    return result;
  }

  if (unverified.length > 0 || stale.length > 0) {
    console.error('\n+--------------------------------------------------+');
    console.error('| ARTIFACT RECENCY AUDIT                           |');
    console.error('+--------------------------------------------------+');
    if (unverified.length > 0) {
      console.error(`| UNVERIFIED ARTIFACTS (${unverified.length}):`.padEnd(51) + '|');
      unverified.slice(0, 5).forEach(s => console.error(`|  - ${s.label.padEnd(46)} |`));
      if (unverified.length > 5) console.error('|  ... and more'.padEnd(51) + '|');
    }
    if (stale.length > 0) {
      console.error(`| STALE ARTIFACTS (>6 MONTHS) (${stale.length}):`.padEnd(51) + '|');
      stale.slice(0, 5).forEach(s => console.error(`|  - ${s.label.padEnd(46)} |`));
      if (stale.length > 5) console.error('|  ... and more'.padEnd(51) + '|');
    }
    console.error('|                                                  |');
    console.error('| Action Required: Spawn artifact-integrator to    |');
    console.error('| run updaters on these files.                     |');
    console.error('+--------------------------------------------------+\n');
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const result = auditArtifacts({ json: jsonMode, writeRuntimeFile: jsonMode });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = { auditArtifacts, collectSkillFiles, collectAgentFiles, isLikelyIso8601 };
