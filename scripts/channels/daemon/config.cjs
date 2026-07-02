/**
 * config.cjs — Channel daemon configuration loader
 *
 * Loads from ~/.claude/channels/config.json with env var overrides.
 * Follows clawhip's pattern: sources → router → renderer → sinks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PORT = 3101; // 3100 is A2A server
const DEFAULT_POLL_INTERVAL = 30000; // 30s
const DEFAULT_MODEL = 'sonnet';

const CONFIG_PATH = path.join(os.homedir(), '.claude', 'channels', 'config.json');
const ACCESS_PATH = path.join(os.homedir(), '.claude', 'channels', 'telegram', 'access.json');

/** Valid DM access policies */
const DM_POLICIES = ['pairing', 'allowlist', 'disabled'];

/**
 * Load and parse access.json, returning structured access config.
 * @returns {{ dmPolicy: string, allowFrom: string[], groups: object[], pending: object[] }}
 */
function loadAccessConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(ACCESS_PATH, 'utf8'));
    const dmPolicy = DM_POLICIES.includes(data.dmPolicy) ? data.dmPolicy : 'pairing';
    const allowFrom = (data.allowFrom || []).map(String);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const pending = Array.isArray(data.pending) ? data.pending : [];
    return { dmPolicy, allowFrom, groups, pending };
  } catch {
    // No access.json or corrupt — default to pairing mode with empty lists
    return { dmPolicy: 'pairing', allowFrom: [], groups: [], pending: [] };
  }
}

function loadDotenv(root) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
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
    if (!process.env[key]) process.env[key] = val;
  }
}

// eslint-disable-next-line complexity
function loadConfig(root) {
  loadDotenv(root);

  // Base config from file
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      /* ignored */
    }
  }

  // Load structured access config (3-policy ACL)
  const accessConfig = loadAccessConfig();

  // Build allowed users set from env + access.json allowFrom
  const allowed = new Set();
  const envUsers = (process.env.TELEGRAM_ALLOWED_USERS || '').trim();
  if (envUsers) envUsers.split(',').forEach(id => allowed.add(id.trim()));
  const ownerId = (process.env.TELEGRAM_OWNER_ID || '').trim();
  if (ownerId) allowed.add(ownerId);
  accessConfig.allowFrom.forEach(id => allowed.add(id));

  // Mode: 'developer' (default) or 'business'
  const mode = process.env.CHANNEL_MODE || fileConfig.mode || 'developer';

  return {
    mode,
    daemon: {
      port:
        parseInt(process.env.CHANNEL_DAEMON_PORT || '', 10) ||
        fileConfig.daemon?.port ||
        DEFAULT_PORT,
      host: process.env.CHANNEL_DAEMON_HOST || fileConfig.daemon?.host || '127.0.0.1',
      apiToken: (
        process.env.CHANNEL_DAEMON_API_TOKEN ||
        process.env.CHANNEL_DAEMON_TOKEN ||
        ''
      ).trim(),
    },
    renderer: {
      model: process.env.CHANNEL_MODEL || fileConfig.renderer?.model || DEFAULT_MODEL,
      authToken: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
      projectRoot: process.env.CHANNEL_PROJECT_ROOT || root,
      mode,
    },
    business: fileConfig.business || {
      companyName: process.env.CHANNEL_COMPANY_NAME || 'Our Company',
      knowledgeBase: process.env.CHANNEL_KNOWLEDGE_BASE || '',
      handoffEmail: process.env.CHANNEL_HANDOFF_EMAIL || '',
      canExecuteTasks: false,
    },
    sources: {
      telegram: {
        enabled: !!(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
        token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
        allowedUsers: allowed,
        allowAll: (process.env.TELEGRAM_ALLOW_ALL || '').toLowerCase() === 'true',
        dmPolicy: accessConfig.dmPolicy,
        groups: accessConfig.groups,
        pending: accessConfig.pending,
        pollInterval:
          parseInt(process.env.TELEGRAM_POLL_INTERVAL || '', 10) || DEFAULT_POLL_INTERVAL,
      },
      discord: {
        enabled: !!(process.env.DISCORD_BOT_TOKEN || '').trim(),
        token: (process.env.DISCORD_BOT_TOKEN || '').trim(),
        allowedUsers: new Set((process.env.DISCORD_ALLOWED_USERS || '').split(',').filter(Boolean)),
        allowAll: (process.env.DISCORD_ALLOW_ALL || '').toLowerCase() === 'true',
      },
      slack: {
        enabled: !!(process.env.SLACK_BOT_TOKEN || '').trim(),
        botToken: (process.env.SLACK_BOT_TOKEN || '').trim(),
        appToken: (process.env.SLACK_APP_TOKEN || '').trim(),
        webhookUrl: (process.env.SLACK_WEBHOOK_URL || '').trim(),
        channels: (process.env.SLACK_CHANNELS || '').split(',').filter(Boolean),
        allowedUsers: new Set((process.env.SLACK_ALLOWED_USERS || '').split(',').filter(Boolean)),
        allowAll: (process.env.SLACK_ALLOW_ALL || '').toLowerCase() === 'true',
      },
      web: {
        enabled: (process.env.CHANNEL_WEB_WIDGET || '').toLowerCase() === 'true',
      },
    },
    routes: fileConfig.routes || [
      // Default: all telegram messages get a Claude response
      { event: 'telegram.*', handler: 'claude', sink: 'telegram' },
    ],
    proactive: fileConfig.proactive || {
      enabled: (process.env.CHANNEL_PROACTIVE || '').toLowerCase() === 'true',
      tickIntervalMs: 60000,
      schedules: [],
    },
  };
}

module.exports = {
  loadConfig,
  loadAccessConfig,
  CONFIG_PATH,
  ACCESS_PATH,
  DEFAULT_PORT,
  DM_POLICIES,
};
