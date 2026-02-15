#!/usr/bin/env node

/**
 * tdd - Post-Execute Hook
 * Emits evidence warnings and updates a bounded memory acceleration profile.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_PROFILE_BYTES = 16 * 1024;
const MAX_ENTRIES_PER_BUCKET = 20;
const MAX_VALUE_LEN = 180;

function parseResult() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function findProjectRoot() {
  let dir = __dirname;
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveProfilePath() {
  if (process.env.TDD_MEMORY_PROFILE_PATH) {
    return process.env.TDD_MEMORY_PROFILE_PATH;
  }
  return path.join(findProjectRoot(), '.claude', 'context', 'runtime', 'tdd-memory-profile.json');
}

function trimValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_VALUE_LEN);
}

function baseProfile() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    commandHints: {
      testCommand: '',
      lintCommand: '',
      formatCommand: '',
    },
    entries: {
      failureSignatures: [],
      antiPatterns: [],
      scenarioTemplates: [],
    },
  };
}

function loadProfile(profilePath) {
  if (!fs.existsSync(profilePath)) {
    return baseProfile();
  }

  try {
    const data = fs.readFileSync(profilePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...baseProfile(),
      ...parsed,
      commandHints: {
        ...baseProfile().commandHints,
        ...(parsed.commandHints || {}),
      },
      entries: {
        ...baseProfile().entries,
        ...(parsed.entries || {}),
      },
    };
  } catch (_err) {
    return baseProfile();
  }
}

function upsertEntry(bucket, value, fixSummary) {
  if (!value) {
    return;
  }
  const now = new Date().toISOString();
  const index = bucket.findIndex(item => item.value === value);
  if (index >= 0) {
    bucket[index].count = (bucket[index].count || 1) + 1;
    bucket[index].lastSeen = now;
    if (fixSummary) {
      bucket[index].fixSummary = fixSummary;
    }
    return;
  }
  bucket.unshift({
    value,
    fixSummary: fixSummary || '',
    count: 1,
    lastSeen: now,
  });
  if (bucket.length > MAX_ENTRIES_PER_BUCKET) {
    bucket.length = MAX_ENTRIES_PER_BUCKET;
  }
}

function enforceProfileSize(profile) {
  const buckets = [
    profile.entries.failureSignatures,
    profile.entries.antiPatterns,
    profile.entries.scenarioTemplates,
  ];
  let serialized = JSON.stringify(profile);
  while (serialized.length > MAX_PROFILE_BYTES) {
    let trimmed = false;
    for (const bucket of buckets) {
      if (bucket.length > 5) {
        bucket.pop();
        trimmed = true;
      }
    }
    if (!trimmed) {
      break;
    }
    serialized = JSON.stringify(profile);
  }
}

function assessResult(result) {
  const warnings = [];
  const payload = result && typeof result === 'object' ? result : {};

  const redVerified = payload.redVerified === true;
  const greenVerified = payload.greenVerified === true;

  if (!redVerified) {
    warnings.push('Missing RED verification evidence');
  }

  if (!greenVerified) {
    warnings.push('Missing GREEN verification evidence');
  }

  if (payload.repairAttempts !== undefined && payload.repairAttempts > 3) {
    warnings.push('Repair attempts exceeded recommended bound (3)');
  }

  if (payload.testHackingChecks && payload.testHackingChecks.passed === false) {
    warnings.push('Anti-test-hacking checks reported failure');
  }

  return warnings;
}

function updateMemoryProfile(result) {
  const payload =
    result && typeof result.result === 'object' && result.result ? result.result : result || {};
  const profilePath = resolveProfilePath();
  const profile = loadProfile(profilePath);

  const testCommand = trimValue(payload.testCommand);
  const lintCommand = trimValue(payload.lintCommand);
  const formatCommand = trimValue(payload.formatCommand);
  if (testCommand) {
    profile.commandHints.testCommand = testCommand;
  }
  if (lintCommand) {
    profile.commandHints.lintCommand = lintCommand;
  }
  if (formatCommand) {
    profile.commandHints.formatCommand = formatCommand;
  }

  const fixSummary = trimValue(payload.fixSummary);
  upsertEntry(profile.entries.failureSignatures, trimValue(payload.failureSignature), fixSummary);
  upsertEntry(profile.entries.antiPatterns, trimValue(payload.antiPattern), '');
  upsertEntry(profile.entries.scenarioTemplates, trimValue(payload.scenarioTemplate), '');

  profile.updatedAt = new Date().toISOString();
  enforceProfileSize(profile);

  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

  return profilePath;
}

const result = parseResult();
const warnings = assessResult(result);
let profilePath = '';

try {
  profilePath = updateMemoryProfile(result);
} catch (_err) {
  warnings.push('Failed to update tdd-memory-profile');
}

if (warnings.length > 0) {
  console.warn('[TDD] Post-execute warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
} else {
  console.log('[TDD] Post-execute checks passed');
}

if (profilePath) {
  console.log(`[TDD] Memory profile updated: ${profilePath}`);
}
