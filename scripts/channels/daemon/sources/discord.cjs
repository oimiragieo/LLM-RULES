/**
 * discord.cjs — Discord source
 *
 * Connects to Discord via bot gateway (WebSocket) and emits message events.
 * Requires a Discord bot token (DISCORD_BOT_TOKEN).
 *
 * Note: Uses raw WebSocket + REST API — no discord.js dependency.
 * This keeps the daemon lightweight with zero npm dependencies.
 */
'use strict';

const https = require('https');
const { WebSocket } = require('ws');

const API_BASE = 'https://discord.com/api/v10';

function discordApi(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(API_BASE + path);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: method,
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            resolve({ ok: false });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

class DiscordSource {
  constructor(config, dispatch) {
    this.token = config.token;
    this.allowed = config.allowedUsers || new Set();
    this.allowAll = config.allowAll || false;
    this.dispatch = dispatch;
    this.running = false;
    this.ws = null;
    this.heartbeatInterval = null;
    this.lastSequence = null;
    this.botId = null;
  }

  async start() {
    this.running = true;

    // Get gateway URL
    let gatewayUrl;
    try {
      const gateway = await discordApi(this.token, 'GET', '/gateway/bot');
      gatewayUrl = gateway.url;
    } catch (err) {
      throw new Error(`Discord gateway fetch failed: ${err.message}`);
    }

    this._connect(gatewayUrl + '?v=10&encoding=json');
  }

  _connect(url) {
    if (!this.running) return;

    try {
      this.ws = new WebSocket(url);
    } catch {
      // ws module not available — Discord source disabled
      return;
    }

    this.ws.on('message', data => {
      try {
        const payload = JSON.parse(data.toString());
        this._handlePayload(payload);
      } catch {
        /* ignored */
      }
    });

    this.ws.on('close', () => {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      // Reconnect after 5s
      if (this.running) setTimeout(() => this._connect(url), 5000);
    });

    this.ws.on('error', () => {
      // Will trigger close → reconnect
    });
  }

  _handlePayload(payload) {
    const { op, t, s, d } = payload;
    if (s) this.lastSequence = s;

    switch (op) {
      case 10: // Hello — start heartbeat + identify
        this._startHeartbeat(d.heartbeat_interval);
        this._identify();
        break;
      case 11: // Heartbeat ACK
        break;
      case 0: // Dispatch
        this._handleDispatch(t, d);
        break;
    }
  }

  _startHeartbeat(interval) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ op: 1, d: this.lastSequence }));
      }
    }, interval);
  }

  _identify() {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.token,
          intents: 512 + 4096, // GUILD_MESSAGES + MESSAGE_CONTENT
          properties: { os: process.platform, browser: 'agent-studio', device: 'daemon' },
        },
      })
    );
  }

  _handleDispatch(type, data) {
    if (type === 'READY') {
      this.botId = data.user?.id;
      return;
    }

    if (type !== 'MESSAGE_CREATE') return;
    if (!data.content) return;
    if (data.author?.bot) return; // Ignore bot messages
    if (data.author?.id === this.botId) return; // Ignore own messages

    const userId = data.author?.id || '';
    const username = data.author?.username || '';
    if (!this.allowAll && !this.allowed.has(userId) && !this.allowed.has(username)) return;

    this.dispatch({
      type: 'discord.message',
      source: 'discord',
      data: {
        chatId: data.channel_id,
        messageId: data.id,
        user: username || userId,
        userId,
        text: data.content,
        guildId: data.guild_id,
      },
      timestamp: new Date().toISOString(),
    });
  }

  stop() {
    this.running = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignored */
      }
      this.ws = null;
    }
  }
}

module.exports = { DiscordSource, discordApi };
