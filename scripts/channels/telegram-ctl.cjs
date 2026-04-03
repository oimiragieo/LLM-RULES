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
 */

const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'channels', 'telegram-start.cjs');
const PORT = process.env.CHANNEL_DAEMON_PORT || 3101;

const cmd = process.argv[2] || 'status';

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}${urlPath}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
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
      } catch {}
      // Wait for daemon to come up
      await new Promise(r => setTimeout(r, 3000));
      const check = await httpGet('/status');
      if (check) {
        console.log('Telegram daemon started');
        console.log(check);
      } else {
        console.log('Daemon may still be starting. Check: curl http://127.0.0.1:' + PORT + '/status');
      }
      break;
    }
    case 'stop': {
      const result = await httpGet('/stop');
      if (result) {
        console.log('Telegram daemon stopped');
      } else {
        console.log('Telegram daemon not running');
      }
      break;
    }
    case 'restart': {
      await httpGet('/stop');
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

main().catch(err => console.error(err.message));
