'use strict';

const path = require('path');

function toWindowsDrivePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return rawPath;
  const unixDriveMatch = rawPath.match(/^\/([a-zA-Z])\/(.*)$/);
  if (!unixDriveMatch) return rawPath;
  const drive = unixDriveMatch[1].toUpperCase();
  const rest = unixDriveMatch[2].replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}

function canonicalizePathForPlatform(rawPath, projectRoot = null) {
  if (!rawPath || typeof rawPath !== 'string') return rawPath;

  const trimmed = rawPath.replace(/^['"`]|['"`]$/g, '');
  let normalized = trimmed;

  if (process.platform === 'win32') {
    normalized = toWindowsDrivePath(normalized);
  }

  if (projectRoot && !path.isAbsolute(normalized)) {
    return path.resolve(projectRoot, normalized);
  }

  return path.normalize(normalized);
}

function canonicalizePathMentionsInText(text) {
  if (!text || typeof text !== 'string') return text;
  if (process.platform !== 'win32') return text;

  return text.replace(/\/[a-zA-Z]\/[A-Za-z0-9._\-/\\]+/g, match => {
    const normalized = toWindowsDrivePath(match);
    return typeof normalized === 'string' ? normalized : match;
  });
}

module.exports = {
  toWindowsDrivePath,
  canonicalizePathForPlatform,
  canonicalizePathMentionsInText,
};
