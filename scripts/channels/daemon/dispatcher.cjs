/**
 * dispatcher.cjs — Event dispatcher
 *
 * Like clawhip's dispatch.rs — receives events from sources,
 * routes them, renders responses, delivers via sinks.
 * Uses an in-memory event queue (like clawhip's mpsc channel).
 */
'use strict';

const { TaskExecutor } = require('./executor.cjs');

class Dispatcher {
  constructor(router, renderer, sinks, log, memory, config, skillStore) {
    this.router = router;
    this.renderer = renderer;
    this.sinks = sinks;
    this.log = log || console.log;
    this.memory = memory || null;
    this.skillStore = skillStore || null;
    this.executor = new TaskExecutor(config || {}, log);
    this.queue = [];
    this.processing = false;
    this.history = [];
    this.maxHistory = 100;
    this.activeTasks = new Map(); // taskId → { status, description, startTime, chatId }
    this.taskCounter = 0;
    this.pendingClarifications = new Map(); // chatId → { originalText, question, timestamp }
    this.pendingApprovals = new Map(); // chatId → { resolve, reject, command, timestamp }
    this.rateLimits = new Map(); // chatId → [timestamp1, timestamp2, ...]
    this.rateLimitMax = 10; // max messages per minute per user
    this.rateLimitWindowMs = 60000;
    this.stats = { received: 0, processed: 0, errors: 0, tasksExecuted: 0, rateLimited: 0, lastEvent: null };
  }

  /**
   * Enqueue an event for processing.
   * Called by sources when they detect activity.
   */
  enqueue(event) {
    this.stats.received++;
    this.stats.lastEvent = event.timestamp;
    this.queue.push(event);
    this._processQueue();
  }

  /**
   * Process events sequentially (like clawhip's dispatcher loop).
   * Events are processed one at a time to avoid Claude -p concurrency issues.
   */
  async _processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();
      try {
        await this._handleEvent(event);
        this.stats.processed++;
        // Check if it's time to dream (background memory consolidation)
        if (this.memory && this.memory.shouldDream()) {
          this.log('[dispatcher] Triggering dream consolidation...');
          const result = this.memory.dream();
          if (result) this.log(`[dispatcher] Dream: ${result}`);
        }
      } catch (err) {
        this.stats.errors++;
        this.log(`[dispatcher] Error handling ${event.type}: ${err.message}`);
      }
    }

    this.processing = false;
  }

  _checkRateLimit(chatId) {
    const now = Date.now();
    if (!this.rateLimits.has(chatId)) this.rateLimits.set(chatId, []);
    const timestamps = this.rateLimits.get(chatId);
    // Clean old entries
    while (timestamps.length > 0 && now - timestamps[0] > this.rateLimitWindowMs) timestamps.shift();
    if (timestamps.length >= this.rateLimitMax) {
      this.stats.rateLimited++;
      return false; // Over limit
    }
    timestamps.push(now);
    return true; // Under limit
  }

  async _handleEvent(event) {
    // Rate limiting — per-user throttle
    if (event.data?.chatId && !this._checkRateLimit(event.data.chatId)) {
      const sink = this.sinks[event.source];
      if (sink) {
        try { await sink.send(event.data.chatId, '⏳ Slow down! Rate limit reached. Try again in a minute.'); } catch {}
      }
      this.log(`[dispatcher] Rate limited ${event.data.chatId}`);
      return;
    }

    // "While you were away" recap (KAIROS-style)
    if (this.memory && event.data.chatId) {
      const history = this.memory.chats.get(event.data.chatId) || [];
      if (history.length > 0) {
        const lastMsg = history[history.length - 1];
        const idleMs = Date.now() - new Date(lastMsg.timestamp).getTime();
        const IDLE_THRESHOLD = 3600000; // 1 hour
        if (idleMs > IDLE_THRESHOLD && !event.data.text.startsWith('/')) {
          const summary = this.memory.summaries.get(event.data.chatId);
          if (summary) {
            const sink = this.sinks[event.source];
            if (sink) {
              const hours = Math.round(idleMs / 3600000);
              try {
                await sink.send(
                  event.data.chatId,
                  `👋 Welcome back! (${hours}h since last chat)\n\nWhere we left off: ${summary.slice(-300)}`,
                  { replyTo: event.data.messageId }
                );
              } catch {}
            }
          }
        }
      }
    }

    // Check for pending clarification — if user is answering a previous [CLARIFY] question
    const chatId = event.data.chatId;
    if (this.pendingClarifications.has(chatId)) {
      const pending = this.pendingClarifications.get(chatId);
      // Timeout: 5 minutes
      if (Date.now() - pending.timestamp > 300000) {
        this.pendingClarifications.delete(chatId);
      } else {
        // Inject the clarification answer as context
        this.pendingClarifications.delete(chatId);
        event.data.text = `Context: You previously asked "${pending.question}" and the user answered: "${event.data.text}". Now proceed with the original request. Original message was: "${pending.originalText}"`;
        this.log(`[dispatcher] Clarification answered for ${chatId}`);
      }
    }

    // Send typing indicator before rendering (cosmetic, fire-and-forget)
    const typingSink = this.sinks[event.source];
    if (typingSink?.sendTyping) {
      typingSink.sendTyping(event.data.chatId).catch(() => {});
    }

    // Route: find matching routes
    const routes = this.router.resolve(event);

    for (const route of routes) {
      // Render: get response from Claude (or other handler)
      let response;
      if (route.handler === 'claude') {
        if (event.type.startsWith('timer.')) {
          // Proactive/scheduled event — use proactive renderer
          this.log(`[dispatcher] Proactive render for ${event.type}...`);
          response = this.renderer.renderProactive(event);
          if (!response) continue; // skip on error
        } else {
          this.log(`[dispatcher] Rendering response for ${event.type} from ${event.data.user}...`);
          // Apply personality override if set
          if (this._personality) this.renderer.personalityOverride = this._personality;
          response = this.renderer.render(event);
        }
        this.log(`[dispatcher] Response: ${response.slice(0, 80)}...`);
      } else if (route.handler === 'echo') {
        response = `Echo: ${event.data.text}`;
      } else if (route.handler === 'ignore') {
        continue;
      } else {
        response = `Unknown handler: ${route.handler}`;
      }

      // Sink: deliver the response
      const sink = this.sinks[route.sink || event.source];
      if (!sink) {
        this.log(`[dispatcher] No sink for "${route.sink || event.source}"`);
        continue;
      }

      // Check if Claude wants to clarify before executing
      if (response.startsWith('[CLARIFY]')) {
        const question = response.slice(9).trim();
        this.pendingClarifications.set(event.data.chatId, {
          originalText: event.data.text,
          question,
          timestamp: Date.now(),
        });
        this.log(`[dispatcher] Clarification requested for ${event.data.chatId}: ${question.slice(0, 60)}`);
        try {
          await sink.send(event.data.chatId, `❓ ${question}`, {
            replyTo: event.data.messageId,
          });
        } catch {}
        // Record in history but skip further processing
        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: `[CLARIFY] ${question}`,
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        continue; // Don't execute — wait for user's answer
      }

      // Check if Claude wants to hand off to a human (business mode)
      if (response.startsWith('[HANDOFF]')) {
        const summary = response.slice(9).trim();
        this.log(`[dispatcher] Handoff requested: ${summary.slice(0, 80)}`);
        try {
          await sink.send(event.data.chatId,
            `🤝 I'm connecting you with our support team. A human will follow up shortly.\n\nI've shared this summary with them: "${summary.slice(0, 200)}"`,
            { replyTo: event.data.messageId });
        } catch {}
        // Log handoff for audit
        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: `[HANDOFF] ${summary}`,
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        continue;
      }

      // Check if Claude wants to execute a task
      // Check if Claude wants a Ralph loop (iterative verify/fix)
      if (response.startsWith('[RALPH]')) {
        const taskDesc = response.slice(7).trim();
        const taskId = `ralph-${++this.taskCounter}`;
        this.activeTasks.set(taskId, {
          status: 'running',
          description: `[RALPH] ${taskDesc}`,
          startTime: Date.now(),
          chatId: event.data.chatId,
          user: event.data.user,
        });
        this.stats.tasksExecuted++;

        try {
          await sink.send(event.data.chatId, `🔄 Starting Ralph loop: ${taskDesc.slice(0, 100)}...`, {
            replyTo: event.data.messageId,
          });
        } catch {}

        let progressTimer = setInterval(async () => {
          try { await sink.send(event.data.chatId, '⏳ Ralph still working...'); } catch {}
        }, 20000);

        this.log(`[dispatcher] Ralph loop ${taskId}: ${taskDesc.slice(0, 80)}`);
        let result;
        try {
          result = this.executor.executeRalphLoop(taskDesc, {
            maxIterations: 5,
            onProgress: async (msg) => {
              try { await sink.send(event.data.chatId, msg); } catch {}
            },
          });
          this.activeTasks.get(taskId).status = 'completed';
          // Extract skill from successful ralph execution
          if (this.skillStore) {
            setImmediate(() => {
              const skillName = this.skillStore.extractSkill(taskDesc, result);
              if (skillName) this.log(`[dispatcher] Skill extracted: ${skillName}`);
            });
          }
        } catch (err) {
          result = `Ralph failed: ${err.message}`;
          this.activeTasks.get(taskId).status = 'failed';
        }
        clearInterval(progressTimer);
        this.activeTasks.get(taskId).endTime = Date.now();

        const truncatedResult = result.length > 3500 ? result.slice(0, 3500) + '\n\n... (truncated)' : result;
        response = truncatedResult;
      }

      // Check if Claude wants to execute a single task
      if (response.startsWith('[TASK]')) {
        const taskDesc = response.slice(6).trim();
        const taskId = `task-${++this.taskCounter}`;
        this.activeTasks.set(taskId, {
          status: 'running',
          description: taskDesc,
          startTime: Date.now(),
          chatId: event.data.chatId,
          user: event.data.user,
        });
        this.stats.tasksExecuted++;

        // Notify user that task is starting
        try {
          await sink.send(event.data.chatId, `⚙️ Running task: ${taskDesc.slice(0, 100)}...`, {
            replyTo: event.data.messageId,
          });
        } catch {}

        // Progress timer — send "still working" every 15s while task runs
        let progressCount = 0;
        const progressTimer = setInterval(async () => {
          progressCount++;
          const elapsed = progressCount * 15;
          try {
            await sink.send(event.data.chatId, `⏳ Still working... (${elapsed}s)`);
          } catch {}
        }, 15000);

        // Execute the task — try A2A router first for delegation tasks
        this.log(`[dispatcher] Executing task ${taskId}: ${taskDesc.slice(0, 80)}`);
        let result;
        try {
          const isRouterTask = /router|a2a|delegate|spawn.*agent|hand.?off/i.test(taskDesc);
          if (isRouterTask && this.executor.sendToRouter) {
            const routerAvail = await this.executor.isRouterAvailable();
            if (routerAvail) {
              this.log(`[dispatcher] Delegating to A2A router...`);
              const a2aResult = await this.executor.sendToRouter(taskDesc);
              result = a2aResult.result
                ? JSON.stringify(a2aResult.result, null, 2)
                : a2aResult.error || 'Router accepted task (check router session for results)';
            } else {
              result = this.executor.executeTask(taskDesc);
            }
          } else {
            result = this.executor.executeTask(taskDesc);
          }
          this.activeTasks.get(taskId).status = 'completed';
          // Extract skill from successful task
          if (this.skillStore && !result.startsWith('Error')) {
            setImmediate(() => {
              const skillName = this.skillStore.extractSkill(taskDesc, result);
              if (skillName) this.log(`[dispatcher] Skill extracted: ${skillName}`);
            });
          }
        } catch (err) {
          result = `Task failed: ${err.message}`;
          this.activeTasks.get(taskId).status = 'failed';
        }
        this.activeTasks.get(taskId).endTime = Date.now();
        clearInterval(progressTimer);

        // Send the result (truncate for Telegram's 4096 char limit)
        const truncatedResult =
          result.length > 3500 ? result.slice(0, 3500) + '\n\n... (truncated)' : result;
        response = `✅ Task complete:\n\n${truncatedResult}`;

        // Detect file paths in result and send as attachments
        if (sink.sendFile) {
          const filePaths = result.match(/(?:\/[\w./-]+|[A-Z]:\\[\w.\\/-]+)\.(?:md|pdf|csv|txt|json|png|jpg|svg|html|xlsx|docx)/gi);
          if (filePaths) {
            for (const fp of [...new Set(filePaths)].slice(0, 3)) {
              try {
                const sent = await sink.sendFile(event.data.chatId, fp.trim());
                if (sent) this.log(`[dispatcher] Sent file: ${fp}`);
              } catch {}
            }
          }
        }
      }

      try {
        await sink.send(event.data.chatId, response, {
          replyTo: event.data.messageId,
        });
        this.log(`[dispatcher] Delivered to ${route.sink || event.source}`);
        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: response.slice(0, 500),
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        // Daily activity log (append-only, feeds dream consolidation)
        if (this.memory?.appendDailyLog) {
          this.memory.appendDailyLog(event.data.chatId, event.data.user, event.data.text, response);
        }
        // Prompt suggestions (async, non-blocking — failure doesn't affect response)
        if (this.renderer.generateSuggestions && !response.startsWith('[') && event.data.text.length > 10) {
          setImmediate(async () => {
            try {
              const suggestions = this.renderer.generateSuggestions(event.data.text, response);
              if (suggestions.length > 0) {
                await sink.send(event.data.chatId, '💡 ' + suggestions.map(s => `• ${s}`).join('\n'));
              }
            } catch {}
          });
        }
      } catch (err) {
        this.log(`[dispatcher] Sink error: ${err.message}`);
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }

  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  /**
   * Request approval from the user via Telegram.
   * Returns a promise that resolves to 'approve' or 'deny'.
   * Times out after 5 minutes with 'deny'.
   */
  requestApproval(chatId, commandPreview) {
    return new Promise(resolve => {
      // Store the resolver so /approve and /deny can call it
      this.pendingApprovals.set(chatId, {
        resolve,
        command: commandPreview,
        timestamp: Date.now(),
      });

      // Send the approval prompt
      const sink = this.sinks.telegram || Object.values(this.sinks)[0];
      if (sink) {
        sink
          .send(
            chatId,
            `⚠️ **Dangerous command requires approval:**\n\`\`\`\n${commandPreview.slice(0, 200)}\n\`\`\`\nReply /approve to execute or /deny to cancel.`
          )
          .catch(() => {});
      }

      // 5-minute timeout → auto-deny
      setTimeout(() => {
        if (this.pendingApprovals.has(chatId)) {
          this.pendingApprovals.delete(chatId);
          resolve('deny');
          if (sink) {
            sink.send(chatId, '⏰ Approval timed out. Command cancelled.').catch(() => {});
          }
        }
      }, 300000);
    });
  }
}

module.exports = { Dispatcher };
