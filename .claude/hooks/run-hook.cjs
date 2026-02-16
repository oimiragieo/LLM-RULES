const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { findProjectRoot } = require('../lib/utils/project-root.cjs');

function detectProjectRoot(cwd = process.cwd()) {
  const fromCwd = findProjectRoot(cwd);
  if (fs.existsSync(path.join(fromCwd, '.claude', 'hooks'))) {
    return fromCwd;
  }

  const fromScript = findProjectRoot(path.resolve(__dirname, '..', '..'));
  if (fs.existsSync(path.join(fromScript, '.claude', 'hooks'))) {
    return fromScript;
  }

  return path.resolve(__dirname, '..', '..');
}

function resolveHookScriptPath(hookName, projectRoot = detectProjectRoot()) {
  const hooksDir = path.join(projectRoot, '.claude', 'hooks');
  let scriptPath = path.resolve(hooksDir, hookName);

  if (!fs.existsSync(scriptPath)) {
    if (fs.existsSync(scriptPath + '.cjs')) {
      scriptPath += '.cjs';
    } else if (fs.existsSync(scriptPath + '.js')) {
      scriptPath += '.js';
    } else if (fs.existsSync(scriptPath + '.mjs')) {
      scriptPath += '.mjs';
    } else if (fs.existsSync(scriptPath + '.sh')) {
      scriptPath += '.sh';
    }
  }

  return { scriptPath, hooksDir, projectRoot };
}

function main() {
  // 1. Parse arguments
  // node run-hook.cjs <hook-name> [args...]
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node run-hook.cjs <hook-path> [args...]');
    process.exit(1);
  }

  const hookName = args[0];
  const hookArgs = args.slice(1);
  const { scriptPath, hooksDir } = resolveHookScriptPath(hookName);

  if (!fs.existsSync(scriptPath)) {
    console.error(`Error: Hook not found: ${scriptPath}`);
    console.error(`Searched in: ${hooksDir}`);
    process.exit(1);
  }

  // 3. Execute
  // If it's a JS/Node file, run with node. If .sh, run with bash.
  const ext = path.extname(scriptPath);
  let cmd, cmdArgs;

  if (ext === '.sh') {
    cmd = 'bash';
    cmdArgs = [scriptPath, ...hookArgs];
  } else {
    cmd = process.execPath; // node
    cmdArgs = [scriptPath, ...hookArgs];
  }

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  child.on('close', code => {
    process.exit(code);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  detectProjectRoot,
  resolveHookScriptPath,
};
