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
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

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

function auditArtifacts() {
  const skillFiles = walk(SKILLS_DIR, 'SKILL.md');
  const agentFiles = walk(AGENTS_DIR, '.md');

  const unverified = [];
  const stale = [];
  const now = Date.now();

  const allFiles = [...skillFiles, ...agentFiles];

  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const isAgent = file.includes(path.sep + 'agents' + path.sep);
      const name = isAgent ? path.basename(file, '.md') : path.basename(path.dirname(file));

      const verified = content.includes('verified: true');
      const lastVerifiedMatch = content.match(/lastVerifiedAt: (.*)/);

      const label = `${isAgent ? '[AGENT]' : '[SKILL]'} ${name}`;

      if (!verified) {
        unverified.push(label);
      } else if (lastVerifiedMatch) {
        const lastVerifiedStr = lastVerifiedMatch[1]
          .trim()
          .split('\n')[0]
          .replace(/[^-0-9T:Z.]/g, '');
        const lastVerified = new Date(lastVerifiedStr).getTime();
        if (isNaN(lastVerified) || now - lastVerified > SIX_MONTHS_MS) {
          stale.push(label);
        }
      } else {
        stale.push(label);
      }
    } catch (_err) {
      // Skip files we can't read
    }
  }

  if (unverified.length > 0 || stale.length > 0) {
    console.error('\n+--------------------------------------------------+');
    console.error('| ARTIFACT RECENCY AUDIT                           |');
    console.error('+--------------------------------------------------+');
    if (unverified.length > 0) {
      console.error(`| UNVERIFIED ARTIFACTS (${unverified.length}):`.padEnd(51) + '|');
      unverified.slice(0, 5).forEach(s => console.error(`|  - ${s.padEnd(46)} |`));
      if (unverified.length > 5) console.error('|  ... and more'.padEnd(51) + '|');
    }
    if (stale.length > 0) {
      console.error(`| STALE ARTIFACTS (>6 MONTHS) (${stale.length}):`.padEnd(51) + '|');
      stale.slice(0, 5).forEach(s => console.error(`|  - ${s.padEnd(46)} |`));
      if (stale.length > 5) console.error('|  ... and more'.padEnd(51) + '|');
    }
    console.error('|                                                  |');
    console.error('| Action Required: Spawn artifact-integrator to    |');
    console.error('| run updaters on these files.                     |');
    console.error('+--------------------------------------------------+\n');
  }
}

if (require.main === module) {
  auditArtifacts();
}

module.exports = { auditArtifacts };
