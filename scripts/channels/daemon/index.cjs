#!/usr/bin/env node
'use strict';

/**
 * Channel Daemon — agent-studio's clawhip equivalent
 *
 * A standalone event-to-response router daemon that:
 *   - Polls messaging platforms (Telegram, Discord, Slack)
 *   - Routes events through configurable rules
 *   - Renders responses via Claude -p --bare (zero cost when idle)
 *   - Delivers responses back to the source platform
 *   - Exposes HTTP API for status, health, and manual events
 *
 * Architecture (mirrors clawhip):
 *   [Telegram/Discord/Slack] → [Sources] → [Dispatcher Queue]
 *   → [Router] → [Renderer (Claude)] → [Sinks] → [Platform API]
 *
 * Usage:
 *   node scripts/channels/daemon/index.cjs              # start foreground
 *   node scripts/channels/daemon/index.cjs --status     # check if running
 *   node scripts/channels/daemon/index.cjs --stop       # stop running daemon
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS, TELEGRAM_OWNER_ID
 *   ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (for Claude renderer)
 *   CHANNEL_DAEMON_PORT (default: 3100)
 *   CHANNEL_MODEL (default: sonnet)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./config.cjs');
const { Router } = require('./router.cjs');
const { Dispatcher } = require('./dispatcher.cjs');
const { ClaudeRenderer } = require('./renderer.cjs');
const { TelegramSource } = require('./sources/telegram.cjs');
const { TelegramSink } = require('./sinks/telegram.cjs');
const { DiscordSource } = require('./sources/discord.cjs');
const { DiscordSink } = require('./sinks/discord.cjs');
const { SlackSource } = require('./sources/slack.cjs');
const { SlackSink } = require('./sinks/slack.cjs');
const { WebSource } = require('./sources/web.cjs');
const { WebSink } = require('./sinks/web.cjs');
const { DaemonMemory } = require('./memory.cjs');
const { SkillStore } = require('./skills.cjs');
const { TimerSource } = require('./sources/timer.cjs');
const { CommandHandler } = require('./commands.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const PID_FILE = path.join(RUNTIME, 'channel-daemon.pid');
const LOG_FILE = path.join(RUNTIME, 'channel-daemon.log');

// ── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* ignored */
  }
}

// ── CLI Commands ��───────────────────────────────��────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--status')) {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0);
    console.log(`Channel daemon running (PID: ${pid})`);
    // Try to fetch status from HTTP API
    http
      .get(`http://127.0.0.1:${process.env.CHANNEL_DAEMON_PORT || 3100}/status`, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          console.log(data);
          process.exit(0);
        });
      })
      .on('error', () => process.exit(0));
  } catch {
    console.log('Channel daemon not running');
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes('--stop')) {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log(`Stopped channel daemon (PID: ${pid})`);
  } catch {
    console.log('Channel daemon not running');
  }
  process.exit(0);
}

// ── Main Daemon ──────────────────────────────────────────────────────────────
// eslint-disable-next-line require-await
async function main() {
  fs.mkdirSync(RUNTIME, { recursive: true });

  // Check for existing daemon
  try {
    const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(existingPid, 0);
    log(`Another daemon already running (PID: ${existingPid}). Exiting.`);
    process.exit(1);
  } catch {
    /* ignored */
  }

  // Write PID file
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');

  const config = loadConfig(ROOT);
  const startTime = new Date().toISOString();

  log(`Channel daemon v1.0.0 starting (port: ${config.daemon.port})`);

  // Initialize components (clawhip pattern: sinks → renderer → router → dispatcher → sources)
  const sinks = {};
  const sources = [];

  // Telegram
  if (config.sources.telegram.enabled) {
    sinks.telegram = new TelegramSink(config.sources.telegram.token);
    log(`Telegram sink ready (allowed: ${[...config.sources.telegram.allowedUsers].join(', ')})`);
  }

  // 3-tier memory (KAIROS-style)
  const memoryDir = path.join(RUNTIME, 'channel-memory');
  const memory = new DaemonMemory(memoryDir, config.renderer);
  log(`Memory loaded: ${JSON.stringify(memory.getStats())}`);

  // Skill store (OMC-style learned patterns)
  const skillStore = new SkillStore(memoryDir);
  log(`Skills loaded: ${skillStore.skills.length} skills`);

  const renderer = new ClaudeRenderer(config.renderer, memory, skillStore);
  const router = new Router(config.routes);
  const dispatcher = new Dispatcher(
    router,
    renderer,
    sinks,
    log,
    memory,
    config.renderer,
    skillStore
  );

  // Start sources
  if (config.sources.telegram.enabled) {
    // Command handler for /slash commands in Telegram
    const cmdHandler = new CommandHandler(sinks.telegram, memory, dispatcher, log);

    const telegramSource = new TelegramSource(config.sources.telegram, event =>
      dispatcher.enqueue(event)
    );
    // Wire command handler — intercepts / commands before they reach Claude
    telegramSource.onCommand = msgData => cmdHandler.handle(msgData);

    sources.push(telegramSource);
    telegramSource.start().catch(err => log(`Telegram source error: ${err.message}`));
    log('Telegram source started (long-polling + /commands)');
  }

  // Discord
  if (config.sources.discord.enabled) {
    sinks.discord = new DiscordSink(config.sources.discord.token);
    const discordSource = new DiscordSource(config.sources.discord, event =>
      dispatcher.enqueue(event)
    );
    sources.push(discordSource);
    discordSource.start().catch(err => log(`Discord source error: ${err.message}`));
    log('Discord source started (gateway WebSocket)');
  }

  // Slack
  if (config.sources.slack.enabled) {
    sinks.slack = new SlackSink(config.sources.slack);
    const slackSource = new SlackSource(config.sources.slack, event => dispatcher.enqueue(event));
    sources.push(slackSource);
    slackSource.start().catch(err => log(`Slack source error: ${err.message}`));
    log('Slack source started (polling)');
  }

  // Web widget
  let webSource = null;
  if (config.sources.web.enabled) {
    webSource = new WebSource(config.sources.web, event => dispatcher.enqueue(event));
    sinks.web = new WebSink(webSource);
    sources.push(webSource);
    log('Web widget enabled (HTTP + SSE)');
  }

  if (sources.length === 0) {
    log(
      'No sources enabled! Set TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, or SLACK_BOT_TOKEN in .env'
    );
    process.exit(1);
  }

  // Proactive dream timer — auto-consolidate every hour if there's new activity
  setInterval(() => {
    if (memory.shouldDream()) {
      log('[dream] Auto-dream triggered');
      const result = memory.dream();
      if (result) log(`[dream] ${result}`);
    }
  }, 600000); // Check every 10 minutes

  // KAIROS tick engine — proactive scheduled messages
  if (config.proactive?.enabled && config.proactive.schedules?.length > 0) {
    const proactiveConfig = config.proactive;
    const tickEngine = new TimerSource(
      proactiveConfig,
      event => dispatcher.enqueue(event),
      () =>
        dispatcher.stats.lastEvent
          ? Date.now() - new Date(dispatcher.stats.lastEvent).getTime()
          : Infinity
    );
    sources.push(tickEngine);
    tickEngine.start();
    log(`Tick engine started (${proactiveConfig.schedules.length} schedules)`);
  }

  // User schedule executor — checks dispatcher._userSchedules every 60s
  setInterval(() => {
    const userSchedules = dispatcher._userSchedules;
    if (!userSchedules || userSchedules.size === 0) return;
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const _dow = now.getDay();
    for (const [chatId, schedules] of userSchedules) {
      for (const sched of schedules) {
        // Simple cron check (reuse TimerSource logic)
        const parts = sched.cron.split(/\s+/);
        if (parts.length < 5) continue;
        const [cronMin, cronHour] = parts;
        const minMatch = cronMin === '*' || parseInt(cronMin) === minute;
        const hourMatch = cronHour === '*' || parseInt(cronHour) === hour;
        if (minMatch && hourMatch) {
          // Dedup key
          const key = `${sched.cron}:${now.toISOString().split('T')[0]}`;
          if (!dispatcher._firedSchedules) dispatcher._firedSchedules = new Set();
          if (dispatcher._firedSchedules.has(key)) continue;
          dispatcher._firedSchedules.add(key);
          dispatcher.enqueue({
            type: 'timer.user-schedule',
            source: 'telegram',
            data: {
              chatId,
              messageId: 0,
              user: 'scheduler',
              userId: 'scheduler',
              text: sched.prompt,
            },
            timestamp: now.toISOString(),
          });
          log(`[schedule] Fired user schedule for ${chatId}: ${sched.prompt.slice(0, 50)}`);
        }
      }
    }
  }, 60000);

  // ── HTTP Server (like clawhip's axum routes) ─────────────────────────────
  // eslint-disable-next-line complexity
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // Health check
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }

    // Status
    if (url.pathname === '/status' || url.pathname === '/api/status') {
      res.end(
        JSON.stringify(
          {
            status: 'running',
            pid: process.pid,
            startTime,
            uptime: Math.round(process.uptime()),
            sources: Object.keys(config.sources).filter(k => config.sources[k].enabled),
            sinks: Object.keys(sinks),
            dispatcher: dispatcher.getStats(),
            model: config.renderer.model,
          },
          null,
          2
        )
      );
      return;
    }

    // Manual event injection (like clawhip's /event endpoint)
    if (url.pathname === '/event' || url.pathname === '/api/event') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'POST only' }));
        return;
      }
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try {
          const event = JSON.parse(body);
          if (!event.type) throw new Error('event.type required');
          event.timestamp = event.timestamp || new Date().toISOString();
          event.source = event.source || 'api';
          dispatcher.enqueue(event);
          res.statusCode = 202;
          res.end(JSON.stringify({ accepted: true, event: event.type }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Send message — router calls this to send a message to a Telegram user
    if ((url.pathname === '/send' || url.pathname === '/api/send') && req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', async () => {
        try {
          const { chat_id, text, reply_to } = JSON.parse(body);
          if (!chat_id || !text) throw new Error('chat_id and text required');
          const sink = sinks.telegram;
          if (!sink) throw new Error('Telegram sink not available');
          const msgId = await sink.send(chat_id, text, { replyTo: reply_to });
          log(`[api/send] Sent to ${chat_id}: ${text.slice(0, 80)}`);
          res.end(JSON.stringify({ sent: true, message_id: msgId }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Memory status and management
    if (url.pathname === '/memory' || url.pathname === '/api/memory') {
      res.end(
        JSON.stringify(
          {
            memory: memory.getStats(),
            profiles: Object.fromEntries([...memory.profiles].map(([k, v]) => [k, v.facts])),
          },
          null,
          2
        )
      );
      return;
    }

    // Trigger dream consolidation manually
    if (url.pathname === '/dream' || url.pathname === '/api/dream') {
      log('[api] Manual dream triggered');
      const result = memory.dream();
      res.end(JSON.stringify({ result: result || 'No dream needed (not enough new messages)' }));
      return;
    }

    // History — recent events processed by the daemon
    if (url.pathname === '/history' || url.pathname === '/api/history') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      res.end(
        JSON.stringify(
          {
            events: dispatcher.getHistory(limit),
            stats: dispatcher.getStats(),
          },
          null,
          2
        )
      );
      return;
    }

    // Webhook endpoint — accept GitHub, CI/CD, or custom webhook events
    if (
      (url.pathname === '/webhook' || url.pathname.startsWith('/webhook/')) &&
      req.method === 'POST'
    ) {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const source = url.pathname.split('/').pop() || 'webhook';

          // Detect GitHub webhook
          const githubEvent = req.headers['x-github-event'];
          let text;
          if (githubEvent) {
            const repo = payload.repository?.full_name || 'unknown';
            if (githubEvent === 'push') {
              const commits = payload.commits?.length || 0;
              text = `🔔 GitHub push to ${repo}: ${commits} commit(s) by ${payload.pusher?.name || 'unknown'}`;
            } else if (githubEvent === 'pull_request') {
              text = `🔔 GitHub PR ${payload.action}: #${payload.pull_request?.number} "${payload.pull_request?.title}" on ${repo}`;
            } else if (githubEvent === 'issues') {
              text = `🔔 GitHub issue ${payload.action}: #${payload.issue?.number} "${payload.issue?.title}" on ${repo}`;
            } else {
              text = `🔔 GitHub ${githubEvent} on ${repo}`;
            }
          } else {
            text = `🔔 Webhook (${source}): ${JSON.stringify(payload).slice(0, 300)}`;
          }

          // Send directly to owner's chat as notification (no Claude processing needed)
          const homeChat = process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
          if (homeChat && sinks.telegram) {
            sinks.telegram.send(homeChat, text).catch(() => {});
            log(`[webhook] Notified ${homeChat}: ${text.slice(0, 80)}`);
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ received: true }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Stop endpoint
    if (url.pathname === '/stop' || url.pathname === '/api/stop') {
      res.end(JSON.stringify({ stopping: true }));
      shutdown();
      return;
    }

    // Web widget routes
    if (webSource && webSource.handleHttp(req, res, url)) return;

    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: 'not found',
        routes: [
          '/health',
          '/status',
          '/send',
          '/history',
          '/memory',
          '/dream',
          '/event',
          '/stop',
          '/web/message',
          '/web/stream/:id',
        ],
      })
    );
  });

  server.listen(config.daemon.port, config.daemon.host, () => {
    log(`HTTP server listening on ${config.daemon.host}:${config.daemon.port}`);
    log(`Status: http://${config.daemon.host}:${config.daemon.port}/status`);
  });

  // ── Shutdown ─────────────────────────────────────────────────────────────
  function shutdown() {
    log('Shutting down...');
    sources.forEach(s => s.stop());
    server.close();
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignored */
    }
    log('Daemon stopped');
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', err => {
    log(`Uncaught: ${err.message}`);
  });
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
