'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function validateCheckpointId(checkpointId) {
  const id = String(checkpointId || '').trim();
  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error('SEC-006: Invalid checkpoint id');
  }
  return id;
}

function validatePathWithinRoot(filePath, projectRoot) {
  const candidate = String(filePath || '');
  if (!candidate || candidate.includes('\0')) {
    throw new Error('SEC-006: Invalid path');
  }
  const root = path.resolve(projectRoot || process.cwd());
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('SEC-006: Invalid path outside project root');
  }
  return resolved;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

class RollbackManager {
  constructor(options = {}) {
    this.checkpointDir =
      options.checkpointDir || path.join(process.cwd(), '.claude', 'checkpoints');
    this.logFile = options.logFile || path.join(this.checkpointDir, 'rollback-log.jsonl');
  }

  _checkpointPath(checkpointId) {
    return path.join(this.checkpointDir, validateCheckpointId(checkpointId));
  }

  _loadManifest(checkpointId) {
    if (!checkpointId) return null;
    const manifestPath = path.join(this._checkpointPath(checkpointId), 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  _appendLog(entry) {
    try {
      ensureDir(this.logFile);
      fs.appendFileSync(this.logFile, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (_err) {
      // best effort
    }
  }

  createCheckpoint(label, filePaths = [], metadata = {}, projectRoot = process.cwd()) {
    const id = `cp-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
    const checkpointPath = this._checkpointPath(id);
    fs.mkdirSync(checkpointPath, { recursive: true });

    const root = path.resolve(projectRoot);
    const files = [];
    for (const inputPath of filePaths) {
      const absolutePath = validatePathWithinRoot(inputPath, root);
      const relativePath = path.relative(root, absolutePath);
      const snapshotPath = path.join(checkpointPath, 'files', relativePath);
      const exists = fs.existsSync(absolutePath);
      if (exists) {
        ensureDir(snapshotPath);
        fs.copyFileSync(absolutePath, snapshotPath);
      }
      files.push({
        path: absolutePath,
        relativePath,
        snapshotPath: exists ? snapshotPath : null,
        existed: exists,
      });
    }

    const manifest = {
      id,
      label: String(label || '').trim() || 'checkpoint',
      createdAt: new Date().toISOString(),
      projectRoot: root,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      files,
    };

    fs.writeFileSync(
      path.join(checkpointPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
    this._appendLog({
      event: 'checkpoint_created',
      id,
      fileCount: files.length,
      timestamp: manifest.createdAt,
    });
    return id;
  }

  rollback(checkpointId, projectRoot = process.cwd()) {
    const manifest = this._loadManifest(checkpointId);
    if (!manifest) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    const root = path.resolve(projectRoot);
    const files = Array.isArray(manifest.files) ? manifest.files : [];

    for (const file of files) {
      const targetPath = validatePathWithinRoot(file.path, root);
      if (file.existed && file.snapshotPath && fs.existsSync(file.snapshotPath)) {
        ensureDir(targetPath);
        fs.copyFileSync(file.snapshotPath, targetPath);
      } else if (!file.existed && fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true });
      }
    }

    const timestamp = new Date().toISOString();
    this._appendLog({
      event: 'rollback_applied',
      id: checkpointId,
      fileCount: files.length,
      timestamp,
    });
    return { restored: files.length, checkpointId, timestamp };
  }

  listCheckpoints() {
    if (!fs.existsSync(this.checkpointDir)) return [];
    const entries = fs
      .readdirSync(this.checkpointDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory());
    const manifests = [];
    for (const entry of entries) {
      const manifest = this._loadManifest(entry.name);
      if (manifest) manifests.push(manifest);
    }
    return manifests.sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
  }
}

module.exports = {
  RollbackManager,
  validatePathWithinRoot,
  validateCheckpointId,
};
