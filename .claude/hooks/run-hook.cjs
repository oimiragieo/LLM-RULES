const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 1. Parse arguments
// node run-hook.cjs <hook-name> [args...]
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node run-hook.cjs <hook-path> [args...]');
  process.exit(1);
}

const hookName = args[0];
const hookArgs = args.slice(1);

// 2. Resolve hook path
// Support "session/memory-reminder" -> ".claude/hooks/session/memory-reminder.cjs"
const projectRoot = path.resolve(__dirname, '../../');
const hooksDir = path.join(projectRoot, '.claude', 'hooks');

let scriptPath = path.resolve(hooksDir, hookName);

// Auto-append extension if missing
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
});

child.on('close', code => {
  process.exit(code);
});
