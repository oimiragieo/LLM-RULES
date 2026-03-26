'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function getMemoryDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

function getMetricsDir(projectRoot) {
  const metricsDir = path.join(getMemoryDir(projectRoot), 'metrics');
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }
  return metricsDir;
}

function getFileSizeKB(filePath, logger = null) {
  try {
    if (fs.existsSync(filePath)) {
      return Math.round(fs.statSync(filePath).size / 1024);
    }
  } catch (e) {
    logger?.debug('getFileSizeKB error', { function: 'getFileSizeKB', error: e.message });
  }
  return 0;
}

function getJsonEntryCount(filePath, logger = null) {
  try {
    if (fs.existsSync(filePath)) {
      const data = safeParseJSON(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) return data.length;
      if (data.discovered_files) return Object.keys(data.discovered_files).length;
    }
  } catch (e) {
    logger?.debug('getJsonEntryCount error', { function: 'getJsonEntryCount', error: e.message });
  }
  return 0;
}

function countDirFiles(dirPath, pattern = /\.json$/) {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    return files.filter(file => pattern.test(file)).length;
  } catch {
    return 0;
  }
}

function getDirSizeKB(dirPath, pattern = null) {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    const totalBytes = files
      .filter(file => (pattern ? pattern.test(file) : true))
      .reduce((sum, file) => {
        try {
          return sum + fs.statSync(path.join(dirPath, file)).size;
        } catch {
          return sum;
        }
      }, 0);
    return Math.round(totalBytes / 1024);
  } catch {
    return 0;
  }
}

function countStaleTempArtifacts(memoryDir, thresholds = { hours: 24, max: 10 }) {
  try {
    const tempDir = path.join(memoryDir, 'temp');
    if (!fs.existsSync(tempDir)) return 0;

    const now = Date.now();
    const staleThreshold = thresholds.hours * 60 * 60 * 1000;
    const files = fs.readdirSync(tempDir);

    return files.slice(0, thresholds.max).filter(file => {
      try {
        const stats = fs.statSync(path.join(tempDir, file));
        return now - stats.mtimeMs > staleThreshold;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

function getFileLineCount(filePath, logger = null) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return 0;
    return content.split('\n').length;
  } catch (e) {
    logger?.debug('getFileLineCount error', { function: 'getFileLineCount', error: e.message });
    return 0;
  }
}

function getFileStatus(value, threshold) {
  if (!threshold) return 'healthy';
  if (value >= threshold.critical) return 'critical';
  if (value >= threshold.warn) return 'warning';
  return 'healthy';
}

module.exports = {
  getMemoryDir,
  getMetricsDir,
  getFileSizeKB,
  getJsonEntryCount,
  countDirFiles,
  getDirSizeKB,
  countStaleTempArtifacts,
  getFileLineCount,
  getFileStatus,
};
