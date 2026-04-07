/* eslint max-lines: ["warn", 600] */
/**
 * commands.cjs — Telegram bot commands (OpenClaw-style)
 *
 * Handles /slash commands sent via Telegram before they reach Claude.
 * Returns formatted responses directly via the Telegram sink.
 */
'use strict';

class CommandHandler {
  constructor(sink, memory, dispatcher, log) {
    this.sink = sink;
    this.memory = memory;
    this.dispatcher = dispatcher;
    this.log = log || console.log;
    this.startTime = Date.now();
  }

  /**
   * Handle a / command. Returns true if handled, false if should pass to Claude.
   */
  // eslint-disable-next-line complexity
  async handle(msgData) {
    const { text, chatId, messageId } = msgData;
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/@\w+$/, ''); // strip @botname
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/start':
        return this._reply(
          chatId,
          messageId,
          "👋 Hey! I'm the Agent Studio bot.\n\n" +
            "Just type naturally and I'll respond. I remember our conversations.\n\n" +
            'Commands:\n' +
            '/status — daemon & memory stats\n' +
            '/tasks — running & recent tasks\n' +
            '/cancel <id> — stop a running task\n' +
            '/memory — what I remember about you\n' +
            '/help — show all commands'
        );

      case '/help':
        return this._reply(
          chatId,
          messageId,
          '📋 Available commands:\n\n' +
            '📊 /status — daemon stats & uptime\n' +
            '🧠 /memory — what I remember about you\n' +
            '📜 /history — recent conversations\n' +
            '📋 /tasks — running & recent tasks\n' +
            '🚫 /cancel <id> — stop a running task\n' +
            '💭 /dream — consolidate learnings\n' +
            '🆕 /new — fresh conversation (keeps profile)\n' +
            '🗜 /compress — compact chat memory\n' +
            '🔄 /retry — show last message to resend\n' +
            '🗑 /forget — clear all data about you\n' +
            '🤖 /model — current AI model\n' +
            '🏓 /ping — alive check\n\n' +
            '📈 /insights — usage analytics\n' +
            '💰 /usage — your token costs\n' +
            '⏰ /schedule — manage recurring prompts\n' +
            '🎭 /personality — switch response style\n' +
            '📄 /export — download chat as markdown\n' +
            '🔑 /pair — device pairing for new users\n' +
            '✅ /approve · ❌ /deny — approve pending commands\n\n' +
            '💡 I can also DO things — ask me to run code, check git, run tests, etc.'
        );

      case '/status': {
        const stats = this.dispatcher.getStats();
        const memStats = this.memory.getStats();
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        return this._reply(
          chatId,
          messageId,
          `📊 Status\n\n` +
            `⏱ Uptime: ${hours}h ${mins}m\n` +
            `📨 Messages: ${stats.received} received, ${stats.processed} processed\n` +
            `⚙️ Tasks: ${stats.tasksExecuted || 0} executed\n` +
            `❌ Errors: ${stats.errors}\n` +
            `🧠 Memory: ${memStats.chats} chats, ${memStats.totalMessages} messages\n` +
            `👤 Profiles: ${memStats.profiles} users known\n` +
            `💭 Dream: ${memStats.lastDream} (${memStats.messagesSinceDream} msgs since)\n` +
            `🤖 Model: sonnet`
        );
      }

      case '/memory': {
        const profile = this.memory.getProfile(chatId);
        if (profile.facts.length === 0) {
          return this._reply(
            chatId,
            messageId,
            "🧠 I don't have any long-term memories about you yet.\n\n" +
              'Chat with me more and run /dream to consolidate learnings.'
          );
        }
        return this._reply(
          chatId,
          messageId,
          '🧠 What I remember about you:\n\n' + profile.facts.map(f => `• ${f}`).join('\n')
        );
      }

      case '/history': {
        const recent = this.dispatcher.getHistory(5);
        if (recent.length === 0) {
          return this._reply(chatId, messageId, '📜 No recent conversation history.');
        }
        const lines = recent.map(
          e =>
            `👤 ${e.user}: ${e.message.slice(0, 60)}${e.message.length > 60 ? '…' : ''}\n` +
            `🤖 ${e.response.slice(0, 80)}${e.response.length > 80 ? '…' : ''}`
        );
        return this._reply(chatId, messageId, '📜 Recent:\n\n' + lines.join('\n\n'));
      }

      case '/dream': {
        await this._reply(
          chatId,
          messageId,
          '💭 Dreaming... consolidating memories across conversations...'
        );
        const result = this.memory.dream(true); // force=true to bypass gate
        if (result) {
          const profile = this.memory.getProfile(chatId);
          const factsList =
            profile.facts.length > 0
              ? '\n\nUpdated profile:\n' + profile.facts.map(f => `• ${f}`).join('\n')
              : '';
          return this._reply(chatId, messageId, `💭 ${result}${factsList}`);
        }
        return this._reply(
          chatId,
          messageId,
          '💭 Nothing to consolidate — no conversations found.'
        );
      }

      case '/forget': {
        this.memory.chats.delete(chatId);
        this.memory.summaries.delete(chatId);
        this.memory.profiles.delete(chatId);
        this.memory._saveHistory();
        this.memory._saveSummaries();
        this.memory._saveProfiles();
        return this._reply(
          chatId,
          messageId,
          '🗑 Done. Your chat history, summaries, and profile have been cleared.'
        );
      }

      case '/tasks': {
        const tasks = [...this.dispatcher.activeTasks.entries()];
        if (tasks.length === 0) {
          return this._reply(chatId, messageId, '📋 No tasks executed yet.');
        }
        const now = Date.now();
        const lines = tasks.slice(-10).map(([id, t]) => {
          let dur;
          if (t.status === 'running') {
            const elapsed = Math.round((now - t.startTime) / 1000);
            dur = `${elapsed}s elapsed`;
          } else if (t.endTime) {
            dur = `${Math.round((t.endTime - t.startTime) / 1000)}s`;
          } else {
            dur = '...';
          }
          const icons = {
            completed: '✅',
            failed: '❌',
            running: '🔄',
            cancelled: '🚫',
            timeout: '⏰',
          };
          const icon = icons[t.status] || '⏳';
          return `${icon} ${id}: ${t.description.slice(0, 60)} (${dur})`;
        });
        const running = tasks.filter(([, t]) => t.status === 'running').length;
        const header = running > 0 ? `📋 Tasks (${running} running):\n\n` : '📋 Recent tasks:\n\n';
        const footer = running > 0 ? '\n\nUse /cancel <id> to stop a running task.' : '';
        return this._reply(
          chatId,
          messageId,
          `${header}${lines.join('\n')}\n\nTotal: ${this.dispatcher.stats.tasksExecuted}${footer}`
        );
      }

      case '/cancel': {
        if (!args) {
          return this._reply(
            chatId,
            messageId,
            '❓ Usage: /cancel <task-id>\nSee /tasks for task IDs.'
          );
        }
        const taskId = args.trim();
        const pool = this.dispatcher.taskPool;
        if (!pool) {
          return this._reply(chatId, messageId, '❌ Task pool not available.');
        }
        const task = pool.getTask(taskId);
        if (!task) {
          return this._reply(chatId, messageId, `❌ No task found with ID "${taskId}".`);
        }
        if (task.status !== 'running' && task.status !== 'queued') {
          return this._reply(chatId, messageId, `Task ${taskId} already ${task.status}.`);
        }
        const cancelled = pool.cancel(taskId);
        if (cancelled) {
          return this._reply(
            chatId,
            messageId,
            `🚫 Cancelled task ${taskId}: ${task.description.slice(0, 60)}`
          );
        }
        return this._reply(chatId, messageId, `❌ Could not cancel task ${taskId}.`);
      }

      case '/new': {
        // Fresh conversation — clear chat history but keep profile
        if (this.memory) {
          this.memory.chats.delete(chatId);
          this.memory.summaries.delete(chatId);
          this.memory._saveHistory();
          this.memory._saveSummaries();
        }
        return this._reply(
          chatId,
          messageId,
          '🆕 Fresh conversation started. Your long-term profile is preserved — I still remember who you are.'
        );
      }

      case '/compress': {
        if (this.memory) {
          this.memory._compactChat(chatId);
          const summary = this.memory.summaries.get(chatId);
          return this._reply(
            chatId,
            messageId,
            summary
              ? `🗜 Compressed. Summary:\n\n${summary.slice(0, 500)}`
              : '🗜 Nothing to compress yet.'
          );
        }
        return this._reply(chatId, messageId, '🗜 No memory system available.');
      }

      case '/retry': {
        const history = this.memory?.chats.get(chatId) || [];
        const lastUser = [...history].reverse().find(m => m.role === 'user');
        if (lastUser) {
          return this._reply(
            chatId,
            messageId,
            `🔄 To retry, send your last message again:\n\n"${lastUser.text.slice(0, 200)}"`
          );
        }
        return this._reply(chatId, messageId, '🔄 No previous message to retry.');
      }

      case '/model':
        return this._reply(chatId, messageId, '🤖 Current model: sonnet (Sonnet 4.6)');

      case '/insights': {
        const stats = this.dispatcher.getStats();
        const memStats = this.memory.getStats();
        const usage = this.memory?.getUsage?.(chatId);
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const days = Math.max(1, Math.floor(uptime / 86400));
        const msgsPerDay = Math.round((stats.received / days) * 10) / 10;
        const taskRate =
          stats.tasksExecuted > 0
            ? `${Math.round((stats.tasksExecuted / stats.received) * 100)}%`
            : '0%';

        let insights = `📈 Insights\n\n`;
        insights += `📊 Volume: ${stats.received} messages (${msgsPerDay}/day avg)\n`;
        insights += `⚙️ Tasks: ${stats.tasksExecuted} executed (${taskRate} of messages)\n`;
        insights += `❌ Errors: ${stats.errors} (${stats.received > 0 ? Math.round((stats.errors / stats.received) * 100) : 0}% error rate)\n`;
        insights += `🚫 Rate limited: ${stats.rateLimited || 0}\n`;
        insights += `🧠 Memory: ${memStats.totalMessages} msgs across ${memStats.chats} chats\n`;
        insights += `👤 Known users: ${memStats.profiles}\n`;
        insights += `💭 Dreams: ${memStats.lastDream === 'never' ? '0' : 'active'}\n`;
        if (usage?.month) {
          insights += `\n💰 This month: ~$${usage.month.cost.toFixed(3)} (${Math.round(usage.month.tokens / 1000)}K tokens)`;
        }
        return this._reply(chatId, messageId, insights);
      }

      case '/usage': {
        if (!this.memory?.getUsage)
          return this._reply(chatId, messageId, '📊 Usage tracking not available.');
        const usage = this.memory.getUsage(chatId);
        const fmt = s =>
          s
            ? `${s.messages} msgs, ~${Math.round(s.tokens / 1000)}K tokens, ~$${s.cost.toFixed(3)}`
            : 'none';
        return this._reply(
          chatId,
          messageId,
          `📊 Your usage:\n\n` +
            `Today: ${fmt(usage.today)}\n` +
            `This week: ${fmt(usage.week)}\n` +
            `This month: ${fmt(usage.month)}`
        );
      }

      case '/ping':
        return this._reply(chatId, messageId, '🏓 Pong!');

      case '/title': {
        if (!args) return this._reply(chatId, messageId, '📌 Usage: /title <name>');
        this.memory.saveNamedSession(chatId, args);
        return this._reply(
          chatId,
          messageId,
          `📌 Session saved as "${args}". Resume later with /resume ${args}`
        );
      }

      case '/resume': {
        if (!args) {
          const sessions = this.memory.listNamedSessions();
          if (sessions.length === 0)
            return this._reply(
              chatId,
              messageId,
              '📂 No saved sessions. Use /title <name> to save one.'
            );
          const list = sessions
            .map(s => `• ${s.name} (${s.messageCount} msgs, ${s.savedAt.split('T')[0]})`)
            .join('\n');
          return this._reply(
            chatId,
            messageId,
            `📂 Saved sessions:\n\n${list}\n\nUsage: /resume <name>`
          );
        }
        const loaded = this.memory.loadNamedSession(chatId, args);
        if (loaded)
          return this._reply(
            chatId,
            messageId,
            `📂 Resumed session "${args}". Your conversation history is restored.`
          );
        return this._reply(
          chatId,
          messageId,
          `📂 Session "${args}" not found. Use /resume to list available sessions.`
        );
      }

      case '/sessions': {
        const sessions = this.memory.listNamedSessions();
        if (sessions.length === 0) return this._reply(chatId, messageId, '📂 No saved sessions.');
        const list = sessions
          .map(s => `• ${s.name} (${s.messageCount} msgs, ${s.savedAt.split('T')[0]})`)
          .join('\n');
        return this._reply(chatId, messageId, `📂 Saved sessions:\n\n${list}`);
      }

      case '/pair': {
        if (!args) {
          return this._reply(
            chatId,
            messageId,
            '🔑 Device Pairing\n\n' +
              'New users request access by running: /pair request\n' +
              'Owner approves with: /pair approve <code>'
          );
        }
        if (args === 'request') {
          const code = Math.random().toString(36).slice(2, 8);
          if (!this.dispatcher._pendingPairings) this.dispatcher._pendingPairings = new Map();
          this.dispatcher._pendingPairings.set(code, {
            chatId,
            userId: msgData.userId,
            timestamp: Date.now(),
          });
          return this._reply(
            chatId,
            messageId,
            `🔑 Your pairing code: ${code}\n\nAsk the bot owner to run: /pair approve ${code}`
          );
        }
        if (args.startsWith('approve ')) {
          const code = args.slice(8).trim();
          const pending = this.dispatcher._pendingPairings?.get(code);
          if (!pending) return this._reply(chatId, messageId, `❌ Unknown code: ${code}`);
          this.dispatcher._pendingPairings.delete(code);
          return this._reply(chatId, messageId, `✅ User ${pending.chatId} approved!`);
        }
        return this._reply(chatId, messageId, '🔑 Usage: /pair request | /pair approve <code>');
      }

      case '/schedule': {
        if (!args) {
          // List schedules
          const schedules = this.dispatcher._userSchedules?.get(chatId) || [];
          if (schedules.length === 0)
            return this._reply(
              chatId,
              messageId,
              '⏰ No scheduled tasks.\n\nUsage: /schedule <cron> <prompt>\nExample: /schedule 0 9 * * 1-5 Good morning! What should I work on?'
            );
          const list = schedules
            .map((s, i) => `${i + 1}. \`${s.cron}\` → ${s.prompt.slice(0, 50)}`)
            .join('\n');
          return this._reply(
            chatId,
            messageId,
            `⏰ Your schedules:\n\n${list}\n\nRemove: /schedule remove <number>`
          );
        }
        if (args.startsWith('remove ')) {
          const idx = parseInt(args.slice(7), 10) - 1;
          const schedules = this.dispatcher._userSchedules?.get(chatId) || [];
          if (idx < 0 || idx >= schedules.length)
            return this._reply(chatId, messageId, '⏰ Invalid schedule number.');
          schedules.splice(idx, 1);
          return this._reply(chatId, messageId, '⏰ Schedule removed.');
        }
        // Parse: first 5 tokens are cron, rest is prompt
        const tokens = args.split(/\s+/);
        if (tokens.length < 6)
          return this._reply(
            chatId,
            messageId,
            '⏰ Usage: /schedule <min> <hour> <dom> <month> <dow> <prompt>'
          );
        const cron = tokens.slice(0, 5).join(' ');
        const prompt = tokens.slice(5).join(' ');
        if (!this.dispatcher._userSchedules) this.dispatcher._userSchedules = new Map();
        if (!this.dispatcher._userSchedules.has(chatId))
          this.dispatcher._userSchedules.set(chatId, []);
        this.dispatcher._userSchedules.get(chatId).push({ cron, prompt, chatId });
        return this._reply(chatId, messageId, `⏰ Scheduled: \`${cron}\` → ${prompt.slice(0, 80)}`);
      }

      case '/personality': {
        const personalities = {
          default: 'Casual, helpful AI assistant',
          professional: 'Professional and formal business tone',
          creative: 'Creative, playful, uses metaphors and humor',
          concise: 'Extremely brief — 1-2 sentences max',
          technical: 'Technical depth, code examples, precise terminology',
          friendly: 'Warm, encouraging, uses emoji freely 😊',
        };
        if (!args) {
          if (!this.dispatcher._personalities) this.dispatcher._personalities = new Map();
          const current = this.dispatcher._personalities.get(chatId) || 'default';
          const list = Object.entries(personalities)
            .map(([k, v]) => `${k === current ? '→' : '•'} ${k}: ${v}`)
            .join('\n');
          return this._reply(
            chatId,
            messageId,
            `🎭 Personalities:\n\n${list}\n\nUsage: /personality <name>`
          );
        }
        if (!personalities[args]) {
          return this._reply(
            chatId,
            messageId,
            `🎭 Unknown personality: ${args}. Use /personality to see options.`
          );
        }
        if (!this.dispatcher._personalities) this.dispatcher._personalities = new Map();
        if (args === 'default') {
          this.dispatcher._personalities.delete(chatId);
        } else {
          this.dispatcher._personalities.set(chatId, args);
        }
        return this._reply(
          chatId,
          messageId,
          `🎭 Personality set to: ${args} — ${personalities[args]}`
        );
      }

      case '/export': {
        const history = this.memory?.chats.get(chatId) || [];
        if (history.length === 0)
          return this._reply(chatId, messageId, '📄 No conversation to export.');

        const fs = require('fs');
        const path = require('path');
        const profile = this.memory.getProfile(chatId);
        const summary = this.memory.summaries.get(chatId) || '';

        let md = `# Chat Export\n\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Messages:** ${history.length}\n\n`;
        if (profile.facts.length > 0)
          md += `## Profile\n${profile.facts.map(f => `- ${f}`).join('\n')}\n\n`;
        if (summary) md += `## Summary\n${summary}\n\n`;
        md += `## Conversation\n\n`;
        for (const msg of history) {
          const ts = msg.timestamp ? msg.timestamp.slice(11, 19) : '';
          md +=
            msg.role === 'user'
              ? `**${msg.user}** (${ts}): ${msg.text}\n\n`
              : `**Assistant** (${ts}): ${msg.text}\n\n`;
        }

        const tmpDir = path.join(require('os').tmpdir(), 'daemon-export');
        fs.mkdirSync(tmpDir, { recursive: true });
        const filePath = path.join(tmpDir, `chat-export-${Date.now()}.md`);
        fs.writeFileSync(filePath, md, 'utf8');

        // Send as file if sink supports it
        if (this.sink.sendFile) {
          await this.sink.sendFile(chatId, filePath, { caption: '📄 Chat export' });
          try {
            fs.unlinkSync(filePath);
          } catch {
            /* ignored */
          }
          return true;
        }
        // Fallback: send as text (truncated)
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignored */
        }
        return this._reply(chatId, messageId, md.slice(0, 4000));
      }

      case '/approve': {
        const pending = this.dispatcher.pendingApprovals.get(chatId);
        if (!pending) {
          return this._reply(chatId, messageId, '✅ Nothing pending approval.');
        }
        pending.resolve('approve');
        this.dispatcher.pendingApprovals.delete(chatId);
        return this._reply(chatId, messageId, '✅ Approved. Executing...');
      }

      case '/deny': {
        const pending = this.dispatcher.pendingApprovals.get(chatId);
        if (!pending) {
          return this._reply(chatId, messageId, '❌ Nothing pending to deny.');
        }
        pending.resolve('deny');
        this.dispatcher.pendingApprovals.delete(chatId);
        return this._reply(chatId, messageId, '❌ Denied. Task cancelled.');
      }

      default:
        // Unknown / command — let Claude handle it
        return false;
    }
  }

  async _reply(chatId, messageId, text) {
    try {
      await this.sink.send(chatId, text, { replyTo: messageId });
      this.log(`[cmd] ${chatId}: responded to command`);
    } catch (err) {
      this.log(`[cmd] Error: ${err.message}`);
    }
    return true;
  }
}

module.exports = { CommandHandler };
