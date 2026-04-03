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
  constructor(router, renderer, sinks, log, memory, config) {
    this.router = router;
    this.renderer = renderer;
    this.sinks = sinks;
    this.log = log || console.log;
    this.memory = memory || null;
    this.executor = new TaskExecutor(config || {}, log);
    this.queue = [];
    this.processing = false;
    this.history = [];
    this.maxHistory = 100;
    this.activeTasks = new Map(); // taskId → { status, description, startTime, chatId }
    this.taskCounter = 0;
    this.stats = { received: 0, processed: 0, errors: 0, tasksExecuted: 0, lastEvent: null };
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

  async _handleEvent(event) {
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
                await sink.send(event.data.chatId,
                  `👋 Welcome back! (${hours}h since last chat)\n\nWhere we left off: ${summary.slice(-300)}`,
                  { replyTo: event.data.messageId });
              } catch {}
            }
          }
        }
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

          // Use streaming if sink supports it
          const streamSink = this.sinks[route.sink || event.source];
          if (streamSink?.createStreamSession && this.renderer.renderStream) {
            const session = streamSink.createStreamSession(event.data.chatId, {
              replyTo: event.data.messageId,
            });
            response = await this.renderer.renderStream(event, (chunk) => {
              session.update(chunk).catch(() => {});
            });
            // Finalize only if not a [TASK] (task flow handles its own messaging)
            if (!response.startsWith('[TASK]')) {
              await session.finalize(response);
              // Record in history and skip the normal sink.send below
              this.history.push({
                timestamp: event.timestamp,
                user: event.data.user,
                message: event.data.text,
                response: response.slice(0, 500),
                sink: route.sink || event.source,
              });
              if (this.history.length > this.maxHistory) this.history.shift();
              this.log(`[dispatcher] Streamed to ${route.sink || event.source}`);
              continue; // skip normal delivery — already streamed
            }
          } else {
            // Fallback: sync render
            response = this.renderer.render(event);
          }
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

      // Check if Claude wants to execute a task
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

        // Execute the task
        this.log(`[dispatcher] Executing task ${taskId}: ${taskDesc.slice(0, 80)}`);
        let result;
        try {
          result = this.executor.executeTask(taskDesc);
          this.activeTasks.get(taskId).status = 'completed';
        } catch (err) {
          result = `Task failed: ${err.message}`;
          this.activeTasks.get(taskId).status = 'failed';
        }
        this.activeTasks.get(taskId).endTime = Date.now();

        // Send the result (truncate for Telegram's 4096 char limit)
        const truncatedResult = result.length > 3500
          ? result.slice(0, 3500) + '\n\n... (truncated)'
          : result;
        response = `✅ Task complete:\n\n${truncatedResult}`;
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
}

module.exports = { Dispatcher };
