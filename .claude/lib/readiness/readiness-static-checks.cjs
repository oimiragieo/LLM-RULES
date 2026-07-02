'use strict';

const fs = require('fs');
const path = require('path');

function evaluateStaticExistsCommand(command, cwd) {
  if (!command.startsWith('node -e ') || !command.includes("require('fs')")) {
    return null;
  }

  const paths = [...command.matchAll(/existsSync\('([^']+)'\)/g)].map(match => match[1]);
  if (paths.length === 0) {
    return null;
  }

  const anyExists = paths.some(relativePath => fs.existsSync(path.join(cwd, relativePath)));
  return {
    exitCode: anyExists ? 0 : 1,
    stdout: '',
    stderr: '',
    timedOut: false,
    error: null,
  };
}

function checkFileExists(basePath, filePattern) {
  const fullPath = path.join(basePath, filePattern.pattern);
  if (filePattern.isDir) {
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  }
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
}

module.exports = {
  checkFileExists,
  evaluateStaticExistsCommand,
};
