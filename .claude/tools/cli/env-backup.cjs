#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const BACKUP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'backups', 'env');
const MAX_BACKUPS = 30;

function getDateSuffix() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function pruneOldBackups(dir, max) {
  const files = fs
    .readdirSync(dir)
    .filter(f => f.startsWith('.env.backup-'))
    .sort(); // lexicographic = chronological for YYYY-MM-DD
  if (files.length > max) {
    const toDelete = files.slice(0, files.length - max);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
}

try {
  if (!fs.existsSync(ENV_FILE)) {
    process.stderr.write('[env-backup] ERROR: .env file not found at ' + ENV_FILE + '\n');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const date = getDateSuffix();
  const backupName = `.env.backup-${date}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(ENV_FILE, backupPath);
  pruneOldBackups(BACKUP_DIR, MAX_BACKUPS);

  process.stdout.write(`[env-backup] Backed up .env → ${backupName}\n`);
  process.exit(0);
} catch (err) {
  process.stderr.write('[env-backup] ERROR: ' + err.message + '\n');
  process.exit(1);
}
