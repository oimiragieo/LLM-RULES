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
            '/memory — what I remember about you\n' +
            '/dream — consolidate learnings\n' +
            '/forget — clear your chat history\n' +
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
            '📋 /tasks — executed task history\n' +
            '💭 /dream — consolidate learnings\n' +
            '🆕 /new — fresh conversation (keeps profile)\n' +
            '🗜 /compress — compact chat memory\n' +
            '🔄 /retry — show last message to resend\n' +
            '🗑 /forget — clear all data about you\n' +
            '🤖 /model — current AI model\n' +
            '🏓 /ping — alive check\n\n' +
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
        const lines = tasks.slice(-10).map(([id, t]) => {
          const dur = t.endTime ? `${Math.round((t.endTime - t.startTime) / 1000)}s` : 'running...';
          const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳';
          return `${icon} ${id}: ${t.description.slice(0, 60)} (${dur})`;
        });
        return this._reply(
          chatId,
          messageId,
          `📋 Recent tasks:\n\n${lines.join('\n')}\n\nTotal: ${this.dispatcher.stats.tasksExecuted}`
        );
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

      case '/ping':
        return this._reply(chatId, messageId, '🏓 Pong!');

      case '/title': {
        if (!args) return this._reply(chatId, messageId, '📌 Usage: /title <name>');
        this.memory.saveNamedSession(chatId, args);
        return this._reply(chatId, messageId, `📌 Session saved as "${args}". Resume later with /resume ${args}`);
      }

      case '/resume': {
        if (!args) {
          const sessions = this.memory.listNamedSessions();
          if (sessions.length === 0) return this._reply(chatId, messageId, '📂 No saved sessions. Use /title <name> to save one.');
          const list = sessions.map(s => `• ${s.name} (${s.messageCount} msgs, ${s.savedAt.split('T')[0]})`).join('\n');
          return this._reply(chatId, messageId, `📂 Saved sessions:\n\n${list}\n\nUsage: /resume <name>`);
        }
        const loaded = this.memory.loadNamedSession(chatId, args);
        if (loaded) return this._reply(chatId, messageId, `📂 Resumed session "${args}". Your conversation history is restored.`);
        return this._reply(chatId, messageId, `📂 Session "${args}" not found. Use /resume to list available sessions.`);
      }

      case '/sessions': {
        const sessions = this.memory.listNamedSessions();
        if (sessions.length === 0) return this._reply(chatId, messageId, '📂 No saved sessions.');
        const list = sessions.map(s => `• ${s.name} (${s.messageCount} msgs, ${s.savedAt.split('T')[0]})`).join('\n');
        return this._reply(chatId, messageId, `📂 Saved sessions:\n\n${list}`);
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
