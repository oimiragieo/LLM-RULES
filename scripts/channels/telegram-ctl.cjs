#!/usr/bin/env node
'use strict';

/**
 * telegram-ctl.cjs — Simple CLI to start/stop/status the channel daemon.
 *
 * Usage:
 *   node scripts/channels/telegram-ctl.cjs start
 *   node scripts/channels/telegram-ctl.cjs stop
 *   node scripts/channels/telegram-ctl.cjs status
 *   node scripts/channels/telegram-ctl.cjs restart
 *   node scripts/channels/telegram-ctl.cjs doctor          # validate config
 *   node scripts/channels/telegram-ctl.cjs doctor --fix    # validate + auto-fix
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'channels', 'telegram-start.cjs');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const PID_FILE = path.join(RUNTIME, 'channel-daemon.pid');
const PORT = process.env.CHANNEL_DAEMON_PORT || 3101;

const cmd = process.argv[2] || 'status';

function getDaemonApiToken() {
  const token = String(
    process.env.CHANNEL_DAEMON_API_TOKEN || process.env.CHANNEL_DAEMON_TOKEN || ''
  ).trim();
  if (token) return token;
  return String(loadEnvFile(ENV_PATH).CHANNEL_DAEMON_API_TOKEN || '').trim();
}

function httpGet(urlPath) {
  return new Promise((resolve, _reject) => {
    const token = getDaemonApiToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: urlPath, headers }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 400 ? data : null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function stopByPidFile() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    return true;
  } catch {
    return false;
  }
}

async function stopDaemon() {
  const result = await httpGet('/stop');
  return !!result || stopByPidFile();
}

// ---------------------------------------------------------------------------
// doctor command — config validation and auto-migration
// ---------------------------------------------------------------------------

const TELEGRAM_DIR = path.join(os.homedir(), '.claude', 'channels', 'telegram');
const CHANNELS_DIR = path.join(os.homedir(), '.claude', 'channels');
const ENV_PATH = path.join(TELEGRAM_DIR, '.env');
const ACCESS_PATH = path.join(TELEGRAM_DIR, 'access.json');
const CONFIG_JSON_PATH = path.join(CHANNELS_DIR, 'config.json');

/**
 * Load .env file as key-value map (mirrors config.cjs loadDotenv but returns values).
 */
function loadEnvFile(envPath) {
  const vars = {};
  if (!fs.existsSync(envPath)) return vars;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    vars[key] = val;
  }
  return vars;
}

/**
 * Check for TELEGRAM_BOT_TOKEN in env and .env file.
 */
function checkBotToken(fix) {
  const result = { name: 'TELEGRAM_BOT_TOKEN', status: 'PASS', description: '', changes: [] };
  const envVars = loadEnvFile(ENV_PATH);
  const hasEnvFile = !!envVars.TELEGRAM_BOT_TOKEN;
  const hasProcessEnv = !!(process.env.TELEGRAM_BOT_TOKEN || '').trim();

  if (hasEnvFile || hasProcessEnv) {
    result.description = hasEnvFile ? 'Found in ' + ENV_PATH : 'Found in process environment';
    return result;
  }

  result.status = 'FAIL';
  result.description = 'TELEGRAM_BOT_TOKEN not found in env or ' + ENV_PATH;

  if (fix) {
    // Ensure directory exists
    fs.mkdirSync(TELEGRAM_DIR, { recursive: true });
    if (!fs.existsSync(ENV_PATH)) {
      fs.writeFileSync(
        ENV_PATH,
        '# Telegram bot token from @BotFather\nTELEGRAM_BOT_TOKEN=\n',
        'utf8'
      );
      result.changes.push('Created ' + ENV_PATH + ' (fill in your token)');
      result.status = 'WARN';
      result.description = 'Created .env stub — set TELEGRAM_BOT_TOKEN before starting';
    }
  }
  return result;
}

/**
 * Check access.json existence and validity.
 */
function checkAccessJson(fix) {
  const result = { name: 'access.json', status: 'PASS', description: '', changes: [] };

  if (!fs.existsSync(ACCESS_PATH)) {
    result.status = 'WARN';
    result.description = 'access.json not found at ' + ACCESS_PATH;

    if (fix) {
      fs.mkdirSync(TELEGRAM_DIR, { recursive: true });
      const defaultAccess = { allowFrom: [] };
      fs.writeFileSync(ACCESS_PATH, JSON.stringify(defaultAccess, null, 2) + '\n', 'utf8');
      result.changes.push('Created ' + ACCESS_PATH + ' with empty allowFrom');
      result.description = 'Created default access.json — add Telegram user IDs to allowFrom';
    }
    return result;
  }

  // File exists — validate contents
  let data;
  try {
    data = JSON.parse(fs.readFileSync(ACCESS_PATH, 'utf8'));
  } catch (e) {
    result.status = 'FAIL';
    result.description = 'access.json is not valid JSON: ' + e.message;

    if (fix) {
      const backup = ACCESS_PATH + '.bak';
      fs.copyFileSync(ACCESS_PATH, backup);
      const defaultAccess = { allowFrom: [] };
      fs.writeFileSync(ACCESS_PATH, JSON.stringify(defaultAccess, null, 2) + '\n', 'utf8');
      result.changes.push('Backed up corrupt file to ' + backup);
      result.changes.push('Replaced with default access.json');
      result.status = 'WARN';
      result.description = 'Replaced corrupt access.json (backup saved)';
    }
    return result;
  }

  if (!Array.isArray(data.allowFrom)) {
    result.status = 'FAIL';
    result.description = 'access.json missing "allowFrom" array';

    if (fix) {
      data.allowFrom = data.allowFrom ? [data.allowFrom] : [];
      fs.writeFileSync(ACCESS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
      result.changes.push('Added allowFrom array to access.json');
      result.status = 'WARN';
      result.description = 'Fixed: added allowFrom array';
    }
    return result;
  }

  result.description = 'Valid with ' + data.allowFrom.length + ' allowed user(s)';
  return result;
}

/**
 * Check for orphaned/conflicting env allowlist vs access.json allowFrom.
 */
function checkOrphanedAllowlist(fix) {
  const result = {
    name: 'allowlist-conflict',
    status: 'PASS',
    description: '',
    changes: [],
  };

  const envVars = loadEnvFile(ENV_PATH);
  const envUsers = (
    envVars.TELEGRAM_ALLOWED_USERS ||
    process.env.TELEGRAM_ALLOWED_USERS ||
    ''
  ).trim();
  if (!envUsers) {
    result.description = 'No TELEGRAM_ALLOWED_USERS env var set (no conflict)';
    return result;
  }

  const envIds = envUsers
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Load access.json
  let accessIds = [];
  if (fs.existsSync(ACCESS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(ACCESS_PATH, 'utf8'));
      accessIds = (data.allowFrom || []).map(String);
    } catch {
      // access.json invalid — other check handles this
    }
  }

  const accessSet = new Set(accessIds);
  const onlyInEnv = envIds.filter(id => !accessSet.has(String(id)));

  if (onlyInEnv.length === 0) {
    result.description = 'TELEGRAM_ALLOWED_USERS and access.json are in sync';
    return result;
  }

  result.status = 'WARN';
  result.description =
    onlyInEnv.length +
    ' user(s) in TELEGRAM_ALLOWED_USERS but not in access.json: ' +
    onlyInEnv.join(', ');

  if (fix && fs.existsSync(ACCESS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(ACCESS_PATH, 'utf8'));
      const merged = new Set((data.allowFrom || []).map(String));
      for (const id of onlyInEnv) merged.add(String(id));
      data.allowFrom = [...merged];
      fs.writeFileSync(ACCESS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
      result.changes.push('Merged ' + onlyInEnv.length + ' user(s) into access.json allowFrom');
      result.status = 'PASS';
      result.description =
        'Merged env allowlist into access.json (' + data.allowFrom.length + ' total)';
    } catch {
      // access.json parse failed — skip merge
    }
  }

  return result;
}

/**
 * Check config.json existence and structure.
 */
function checkConfigJson(fix) {
  const result = { name: 'config.json', status: 'PASS', description: '', changes: [] };

  if (!fs.existsSync(CONFIG_JSON_PATH)) {
    result.status = 'WARN';
    result.description =
      'config.json not found at ' + CONFIG_JSON_PATH + ' (defaults will be used)';

    if (fix) {
      fs.mkdirSync(CHANNELS_DIR, { recursive: true });
      const defaultConfig = {
        mode: 'developer',
        daemon: { port: 3101, host: '127.0.0.1' },
        routes: [{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }],
      };
      fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
      result.changes.push('Created ' + CONFIG_JSON_PATH + ' with defaults');
      result.status = 'PASS';
      result.description = 'Created default config.json';
    }
    return result;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf8'));
  } catch (e) {
    result.status = 'FAIL';
    result.description = 'config.json is not valid JSON: ' + e.message;

    if (fix) {
      const backup = CONFIG_JSON_PATH + '.bak';
      fs.copyFileSync(CONFIG_JSON_PATH, backup);
      const defaultConfig = {
        mode: 'developer',
        daemon: { port: 3101, host: '127.0.0.1' },
        routes: [{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }],
      };
      fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
      result.changes.push('Backed up corrupt file to ' + backup);
      result.changes.push('Replaced with default config.json');
      result.status = 'WARN';
      result.description = 'Replaced corrupt config.json (backup saved)';
    }
    return result;
  }

  // Validate structure
  const issues = [];
  if (data.mode && !['developer', 'business'].includes(data.mode)) {
    issues.push('mode must be "developer" or "business" (got "' + data.mode + '")');
  }
  if (
    data.daemon &&
    typeof data.daemon.port === 'number' &&
    (data.daemon.port < 1 || data.daemon.port > 65535)
  ) {
    issues.push('daemon.port out of range: ' + data.daemon.port);
  }
  if (data.routes && !Array.isArray(data.routes)) {
    issues.push('routes must be an array');
  }

  if (issues.length > 0) {
    result.status = 'WARN';
    result.description = issues.join('; ');
  } else {
    result.description = 'Valid config (' + (data.mode || 'developer') + ' mode)';
  }

  return result;
}

/**
 * Check that required directories exist.
 */
function checkDirectories(fix) {
  const result = { name: 'directories', status: 'PASS', description: '', changes: [] };
  const dirs = [CHANNELS_DIR, TELEGRAM_DIR];
  const missing = dirs.filter(d => !fs.existsSync(d));

  if (missing.length === 0) {
    result.description = 'All required directories exist';
    return result;
  }

  result.status = 'WARN';
  result.description = missing.length + ' missing directory(ies)';

  if (fix) {
    for (const d of missing) {
      fs.mkdirSync(d, { recursive: true });
      result.changes.push('Created ' + d);
    }
    result.status = 'PASS';
    result.description = 'Created ' + missing.length + ' missing directory(ies)';
  }

  return result;
}

/**
 * Run all doctor checks, optionally fixing issues.
 */
function runDoctor(fix) {
  console.log('Telegram channel doctor' + (fix ? ' (--fix mode)' : '') + '\n');

  const checks = [
    checkDirectories(fix),
    checkBotToken(fix),
    checkAccessJson(fix),
    checkOrphanedAllowlist(fix),
    checkConfigJson(fix),
  ];

  const statusIcon = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL' };
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    const icon = statusIcon[check.status];
    console.log('  [' + icon + '] ' + check.name + ': ' + check.description);
    for (const change of check.changes) {
      console.log('         -> ' + change);
    }
    if (check.status === 'PASS') passCount++;
    else if (check.status === 'WARN') warnCount++;
    else failCount++;
  }

  console.log(
    '\nSummary: ' + passCount + ' passed, ' + warnCount + ' warning(s), ' + failCount + ' failed'
  );

  if (failCount > 0 && !fix) {
    console.log(
      'Run with --fix to auto-repair: node scripts/channels/telegram-ctl.cjs doctor --fix'
    );
  }

  return { checks, passCount, warnCount, failCount };
}

async function main() {
  switch (cmd) {
    case 'start': {
      const status = await httpGet('/health');
      if (status && status.includes('"ok"')) {
        console.log('Telegram daemon already running');
        const info = await httpGet('/status');
        if (info) console.log(info);
        return;
      }
      // Launch via the hook (handles env loading, PowerShell hidden launch)
      try {
        execFileSync('node', [HOOK], {
          cwd: ROOT,
          input: '{}',
          stdio: ['pipe', 'inherit', 'inherit'],
          timeout: 10000,
        });
      } catch {
        /* empty */
      }
      // Wait for daemon to come up
      await new Promise(r => setTimeout(r, 3000));
      const check = await httpGet('/status');
      if (check) {
        console.log('Telegram daemon started');
        console.log(check);
      } else {
        console.log(
          'Daemon may still be starting. Check: curl http://127.0.0.1:' + PORT + '/status'
        );
      }
      break;
    }
    case 'stop': {
      if (await stopDaemon()) {
        console.log('Telegram daemon stopped');
      } else {
        console.log('Telegram daemon not running');
      }
      break;
    }
    case 'restart': {
      await stopDaemon();
      await new Promise(r => setTimeout(r, 2000));
      execFileSync('node', [HOOK], {
        cwd: ROOT,
        input: '{}',
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 10000,
      });
      await new Promise(r => setTimeout(r, 3000));
      const check = await httpGet('/status');
      console.log(check || 'Restarted (check status in a few seconds)');
      break;
    }
    case 'doctor': {
      const fix = process.argv.includes('--fix');
      runDoctor(fix);
      break;
    }
    case 'status':
    default: {
      const info = await httpGet('/status');
      if (info) {
        console.log(info);
      } else {
        console.log('Telegram daemon not running');
      }
      break;
    }
  }
}

if (require.main === module) {
  main().catch(err => console.error(err.message));
}

module.exports = {
  getDaemonApiToken,
  httpGet,
  stopByPidFile,
  stopDaemon,
};
