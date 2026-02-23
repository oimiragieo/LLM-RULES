'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DANGEROUS_PATH_CHARS = [
  '$',
  '`',
  '|',
  '&',
  ';',
  '(',
  ')',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '\n',
  '\r',
];
const DANGEROUS_URL_CHARS = ['`', '|', '&', ';', '(', ')', '<', '>', '\n', '\r'];

function isPathSafe(filePath) {
  if (typeof filePath !== 'string') return false;
  return !DANGEROUS_PATH_CHARS.some(char => filePath.includes(char));
}

function isUrlSafe(url) {
  if (typeof url !== 'string') return false;
  return !DANGEROUS_URL_CHARS.some(char => url.includes(char));
}

function findProjectRoot(startDir) {
  let dir = startDir || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (path.basename(dir) === '.claude') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? argv[++i] : true;
    options[key] = value;
  }
  return options;
}

function runNodeScript(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    stdio: 'inherit',
    shell: false,
  });
  const status = typeof result.status === 'number' ? result.status : 1;
  process.exit(status);
}

function formatDirectory(dirPath, cwd) {
  if (!isPathSafe(dirPath)) {
    return false;
  }

  try {
    const result = spawnSync('pnpm', ['format', dirPath], { cwd, stdio: 'pipe', shell: false });
    return result.status === 0;
  } catch (_e) {
    return false;
  }
}

function loadSchemaValidator() {
  try {
    return require('../../../lib/utils/schema-validator.cjs').validateData;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  fs,
  path,
  spawnSync,
  isPathSafe,
  isUrlSafe,
  findProjectRoot,
  parseOptions,
  runNodeScript,
  formatDirectory,
  loadSchemaValidator,
};
