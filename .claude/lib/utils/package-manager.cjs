#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PROJECT_ROOT } = require('./project-root.cjs');
const { commandExists } = require('./command-exists.cjs');

const PACKAGE_MANAGERS = {
  npm: {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCmd: 'npm install',
    runCmd: 'npm run',
    execCmd: 'npx',
    testCmd: 'npm test',
    buildCmd: 'npm run build',
    devCmd: 'npm run dev',
  },
  pnpm: {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    runCmd: 'pnpm',
    execCmd: 'pnpm dlx',
    testCmd: 'pnpm test',
    buildCmd: 'pnpm build',
    devCmd: 'pnpm dev',
  },
  yarn: {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCmd: 'yarn',
    runCmd: 'yarn',
    execCmd: 'yarn dlx',
    testCmd: 'yarn test',
    buildCmd: 'yarn build',
    devCmd: 'yarn dev',
  },
  bun: {
    name: 'bun',
    lockFile: 'bun.lockb',
    installCmd: 'bun install',
    runCmd: 'bun run',
    execCmd: 'bunx',
    testCmd: 'bun test',
    buildCmd: 'bun run build',
    devCmd: 'bun run dev',
  },
};

const DETECTION_PRIORITY = ['pnpm', 'bun', 'yarn', 'npm'];

function getConfigPath(projectDir = PROJECT_ROOT) {
  return path.join(projectDir, '.claude', 'package-manager.json');
}

function loadConfig(projectDir = PROJECT_ROOT) {
  const configPath = getConfigPath(projectDir);
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (_err) {
    return null;
  }
  return null;
}

function saveConfig(config, projectDir = PROJECT_ROOT) {
  const configPath = getConfigPath(projectDir);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function detectFromLockFile(projectDir = PROJECT_ROOT) {
  for (const pmName of DETECTION_PRIORITY) {
    const pm = PACKAGE_MANAGERS[pmName];
    const lockFilePath = path.join(projectDir, pm.lockFile);
    if (fs.existsSync(lockFilePath)) {
      return pmName;
    }
  }
  return null;
}

function detectFromPackageJson(projectDir = PROJECT_ROOT) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  try {
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      if (pkg.packageManager) {
        const pmName = pkg.packageManager.split('@')[0];
        if (PACKAGE_MANAGERS[pmName]) {
          return pmName;
        }
      }
    }
  } catch (_err) {
    return null;
  }
  return null;
}

function getAvailablePackageManagers() {
  const available = [];
  for (const pmName of Object.keys(PACKAGE_MANAGERS)) {
    if (commandExists(pmName)) {
      available.push(pmName);
    }
  }
  return available;
}

function getPackageManager(options = {}) {
  const { projectDir = PROJECT_ROOT, fallbackOrder = DETECTION_PRIORITY } = options;

  const envPm = process.env.CLAUDE_PACKAGE_MANAGER;
  if (envPm && PACKAGE_MANAGERS[envPm]) {
    return { name: envPm, config: PACKAGE_MANAGERS[envPm], source: 'environment' };
  }

  const projectConfigPath = getConfigPath(projectDir);
  try {
    if (fs.existsSync(projectConfigPath)) {
      const content = fs.readFileSync(projectConfigPath, 'utf8');
      const config = JSON.parse(content);
      if (config.packageManager && PACKAGE_MANAGERS[config.packageManager]) {
        return {
          name: config.packageManager,
          config: PACKAGE_MANAGERS[config.packageManager],
          source: 'project-config',
        };
      }
    }
  } catch (_err) {
    // ignore invalid project config
  }

  const fromPackageJson = detectFromPackageJson(projectDir);
  if (fromPackageJson) {
    return {
      name: fromPackageJson,
      config: PACKAGE_MANAGERS[fromPackageJson],
      source: 'package.json',
    };
  }

  const fromLockFile = detectFromLockFile(projectDir);
  if (fromLockFile) {
    return { name: fromLockFile, config: PACKAGE_MANAGERS[fromLockFile], source: 'lock-file' };
  }

  const homeDir = os.homedir();
  const globalConfigPath = path.join(homeDir, '.claude', 'package-manager.json');
  try {
    if (fs.existsSync(globalConfigPath)) {
      const content = fs.readFileSync(globalConfigPath, 'utf8');
      const config = JSON.parse(content);
      if (config.packageManager && PACKAGE_MANAGERS[config.packageManager]) {
        return {
          name: config.packageManager,
          config: PACKAGE_MANAGERS[config.packageManager],
          source: 'global-config',
        };
      }
    }
  } catch (_err) {
    // ignore invalid global config
  }

  const available = getAvailablePackageManagers();
  for (const pmName of fallbackOrder) {
    if (available.includes(pmName)) {
      return { name: pmName, config: PACKAGE_MANAGERS[pmName], source: 'fallback' };
    }
  }

  return { name: 'npm', config: PACKAGE_MANAGERS.npm, source: 'default' };
}

function setProjectPackageManager(pmName, projectDir = PROJECT_ROOT) {
  if (!PACKAGE_MANAGERS[pmName]) {
    throw new Error(`Unknown package manager: ${pmName}`);
  }

  const configDir = path.join(projectDir, '.claude');
  const configPath = path.join(configDir, 'package-manager.json');
  const config = {
    packageManager: pmName,
    setAt: new Date().toISOString(),
  };

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

function getRunCommand(script, options = {}) {
  const pm = getPackageManager(options);
  switch (script) {
    case 'install':
      return pm.config.installCmd;
    case 'test':
      return pm.config.testCmd;
    case 'build':
      return pm.config.buildCmd;
    case 'dev':
      return pm.config.devCmd;
    default:
      return `${pm.config.runCmd} ${script}`;
  }
}

function getExecCommand(binary, args = '', options = {}) {
  const pm = getPackageManager(options);
  return `${pm.config.execCmd} ${binary}${args ? ` ${args}` : ''}`;
}

function getSelectionPrompt() {
  const available = getAvailablePackageManagers();
  const current = getPackageManager();

  let message = '[PackageManager] Available package managers:\n';
  for (const pmName of available) {
    const indicator = pmName === current.name ? ' (current)' : '';
    message += `  - ${pmName}${indicator}\n`;
  }
  message += '\nTo set your preferred package manager:\n';
  message += '  - Global: Set CLAUDE_PACKAGE_MANAGER environment variable\n';
  message += '  - Or add to ~/.claude/package-manager.json: {"packageManager": "pnpm"}\n';
  message += '  - Or add to package.json: {"packageManager": "pnpm@8"}\n';
  return message;
}

module.exports = {
  PACKAGE_MANAGERS,
  DETECTION_PRIORITY,
  getPackageManager,
  setProjectPackageManager,
  getAvailablePackageManagers,
  detectFromLockFile,
  detectFromPackageJson,
  getRunCommand,
  getExecCommand,
  getSelectionPrompt,
  loadConfig,
  saveConfig,
};
