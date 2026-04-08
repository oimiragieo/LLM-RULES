/* eslint-disable max-lines */
/**
 * dispatcher.cjs — Event dispatcher
 *
 * Like clawhip's dispatch.rs — receives events from sources,
 * routes them, renders responses, delivers via sinks.
 * Uses an in-memory event queue (like clawhip's mpsc channel).
 */
'use strict';

const { TaskExecutor } = require('./executor.cjs');
const { TaskPool } = require('./task-pool.cjs');
const { createMissionExecutor } = require('./mission-executor.cjs');

class Dispatcher {
  constructor(router, renderer, sinks, log, memory, config, skillStore) {
    this.router = router;
    this.renderer = renderer;
    this.sinks = sinks;
    this.log = log || console.log;
    this.memory = memory || null;
    this.skillStore = skillStore || null;
    this.executor = new TaskExecutor(config || {}, log);
    this.missionExecutor = createMissionExecutor(this.executor, {
      projectRoot: (config && config.projectRoot) || process.cwd(),
    });
    this.taskPool = new TaskPool({
      maxConcurrent: (config && config.maxConcurrentTasks) || 3,
      log: this.log,
    });
    this._wirePoolEvents();
    this.queue = [];
    this.processing = false;
    this.history = [];
    this.maxHistory = 100;
    this.activeTasks = new Map(); // taskId → { status, description, startTime, chatId }
    this.taskCounter = 0;
    this.pendingClarifications = new Map(); // chatId → { originalText, question, timestamp }
    this.pendingInterviews = new Map(); // chatId → { originalText, questions, answers, currentRound, timestamp }
    this.pendingApprovals = new Map(); // chatId → { resolve, reject, command, timestamp }
    this._personalities = new Map(); // chatId → personality name
    this.rateLimits = new Map(); // chatId → [timestamp1, timestamp2, ...]
    this.rateLimitMax = 10; // max messages per minute per user
    this.rateLimitWindowMs = 60000;
    this._progressIntervalMs = (config && config.progressIntervalMs) || 15000;
    this.stats = {
      received: 0,
      processed: 0,
      errors: 0,
      tasksExecuted: 0,
      rateLimited: 0,
      lastEvent: null,
    };
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
        this.log(`[dispatcher] Error handling ${event.type}: ${err.message}\n${err.stack || ''}`);
      }
    }

    this.processing = false;
  }

  _checkRateLimit(chatId) {
    const now = Date.now();
    if (!this.rateLimits.has(chatId)) this.rateLimits.set(chatId, []);
    const timestamps = this.rateLimits.get(chatId);
    // Clean old entries
    while (timestamps.length > 0 && now - timestamps[0] >= this.rateLimitWindowMs)
      timestamps.shift();
    if (timestamps.length >= this.rateLimitMax) {
      this.stats.rateLimited++;
      return false; // Over limit
    }
    timestamps.push(now);
    return true; // Under limit
  }

  // eslint-disable-next-line complexity
  async _handleEvent(event) {
    // Rate limiting — per-user throttle
    if (event.data?.chatId && !this._checkRateLimit(event.data.chatId)) {
      const sink = this.sinks[event.source];
      if (sink) {
        try {
          await sink.send(
            event.data.chatId,
            '⏳ Slow down! Rate limit reached. Try again in a minute.'
          );
        } catch {
          /* ignored */
        }
      }
      this.log(`[dispatcher] Rate limited ${event.data.chatId}`);
      return;
    }

    // Session gap detection — clear stale Tier 1 history on long idle gaps.
    // Old conversation is preserved in Tier 2 summaries and Tier 3 profiles.
    // Tier 1 gets a clean slate so Claude doesn't continue old topics.
    if (this.memory && event.data.chatId) {
      const history = this.memory.chats.get(event.data.chatId) || [];
      if (history.length > 0) {
        const lastMsg = history[history.length - 1];
        const idleMs = Date.now() - new Date(lastMsg.timestamp).getTime();
        const IDLE_THRESHOLD = 3600000; // 1 hour
        if (idleMs > IDLE_THRESHOLD && !event.data.text.startsWith('/')) {
          const hours = Math.round(idleMs / 3600000);
          // Compact the old history into Tier 2 summary before clearing
          if (history.length >= 4) {
            this.memory._compactChat(event.data.chatId);
          }
          // Clear Tier 1 — old messages were just compacted into summary
          const chatHistory = this.memory.chats.get(event.data.chatId);
          if (chatHistory) chatHistory.length = 0;
          // Add a minimal session boundary marker
          this.memory.addMessage(
            event.data.chatId,
            'system',
            `[New session after ${hours}h gap. Respond to the user's current message naturally. Their profile and conversation summary are available for context if needed.]`
          );
          this.log(
            `[dispatcher] Session gap: ${hours}h for chat ${event.data.chatId} — Tier 1 cleared, old context compacted to Tier 2`
          );
        }
      }
    }

    const chatId = event.data.chatId;

    // Check for pending interview — multi-round Socratic questioning
    if (this.pendingInterviews.has(chatId)) {
      const interview = this.pendingInterviews.get(chatId);
      // Timeout: 10 min
      if (Date.now() - interview.timestamp > 600000) {
        this.pendingInterviews.delete(chatId);
      } else if (
        event.data.text.toLowerCase() === 'just do it' ||
        event.data.text.toLowerCase() === 'skip'
      ) {
        // Skip remaining questions, execute with what we have
        const context = interview.answers
          .map((a, i) => `Q: ${interview.questions[i]}\nA: ${a}`)
          .join('\n');
        this.pendingInterviews.delete(chatId);
        event.data.text = `Original request: ${interview.originalText}\n\nInterview answers:\n${context}\n\nNow execute the task.`;
        this.log(
          `[dispatcher] Interview skipped for ${chatId}, executing with ${interview.answers.length} answers`
        );
      } else {
        // Store answer and ask next question
        interview.answers.push(event.data.text);
        interview.currentRound++;
        if (interview.currentRound >= interview.questions.length) {
          // All questions answered — synthesize and execute
          const context = interview.answers
            .map((a, i) => `Q: ${interview.questions[i]}\nA: ${a}`)
            .join('\n');
          this.pendingInterviews.delete(chatId);
          event.data.text = `Original request: ${interview.originalText}\n\nInterview answers:\n${context}\n\nNow execute the task based on these clarifications.`;
          this.log(`[dispatcher] Interview complete for ${chatId}, executing with full context`);
        } else {
          // Ask next question
          const nextQ = interview.questions[interview.currentRound];
          const remaining = interview.questions.length - interview.currentRound;
          const sink = this.sinks[event.source];
          if (sink) {
            // eslint-disable-next-line max-depth
            try {
              await sink.send(
                chatId,
                `❓ ${nextQ}\n\n(${remaining} questions remaining, or say "just do it" to skip)`
              );
            } catch {
              /* ignored */
            }
          }
          return; // Wait for next answer
        }
      }
    }

    // Check for pending clarification — if user is answering a previous [CLARIFY] question
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
      typingSink
        .sendTyping(event.data.chatId)
        .catch(e => process.stderr.write(`[WARN] sendTyping: ${e.message}\n`));
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
          try {
            response = this.renderer.renderProactive(event);
          } catch (err) {
            this.log(`[dispatcher] Proactive render error: ${err.message}`);
            continue;
          }
          if (!response) continue; // skip on error
        } else {
          this.log(`[dispatcher] Rendering response for ${event.type} from ${event.data.user}...`);
          // Apply per-user personality override
          const userPersonality = this._personalities?.get(event.data.chatId);
          this.renderer.personalityOverride = userPersonality || null;
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
      // Check if Claude wants a multi-round interview
      if (response.startsWith('[INTERVIEW]')) {
        const lines = response
          .slice(11)
          .trim()
          .split('\n')
          .filter(l => l.trim());
        const questions = lines.map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        if (questions.length > 0) {
          this.pendingInterviews.set(event.data.chatId, {
            originalText: event.data.text,
            questions,
            answers: [],
            currentRound: 0,
            timestamp: Date.now(),
          });
          this.log(
            `[dispatcher] Interview started for ${event.data.chatId}: ${questions.length} questions`
          );
          const remaining = questions.length - 1;
          try {
            await sink.send(
              event.data.chatId,
              `🎓 Before I proceed, let me ask a few questions:\n\n❓ ${questions[0]}\n\n(${remaining} more questions after this, or say "just do it" to skip)`,
              { replyTo: event.data.messageId }
            );
          } catch {
            /* ignored */
          }
          continue;
        }
      }

      if (response.startsWith('[CLARIFY]')) {
        const question = response.slice(9).trim();
        this.pendingClarifications.set(event.data.chatId, {
          originalText: event.data.text,
          question,
          timestamp: Date.now(),
        });
        this.log(
          `[dispatcher] Clarification requested for ${event.data.chatId}: ${question.slice(0, 60)}`
        );
        try {
          await sink.send(event.data.chatId, `❓ ${question}`, {
            replyTo: event.data.messageId,
          });
        } catch {
          /* ignored */
        }
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
          await sink.send(
            event.data.chatId,
            `🤝 I'm connecting you with our support team. A human will follow up shortly.\n\nI've shared this summary with them: "${summary.slice(0, 200)}"`,
            { replyTo: event.data.messageId }
          );
        } catch {
          /* ignored */
        }
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

      // ================================================================
      // ASYNC TASK DISPATCH — spawn into pool, don't block the queue
      // ================================================================

      // Check if Claude wants a Ralph loop (iterative verify/fix)
      if (response.startsWith('[RALPH]')) {
        const taskDesc = response.slice(7).trim();
        const taskId = `ralph-${++this.taskCounter}`;
        this.stats.tasksExecuted++;

        try {
          await sink.send(
            event.data.chatId,
            `🔄 Starting Ralph loop: ${taskDesc.slice(0, 100)}...`,
            { replyTo: event.data.messageId }
          );
        } catch {
          /* ignored */
        }

        this.log(`[dispatcher] Ralph loop ${taskId}: ${taskDesc.slice(0, 80)}`);

        // Spawn into task pool — non-blocking
        const sinkRef = sink;
        const chatId = event.data.chatId;
        this.taskPool.spawn(
          taskId,
          () => {
            const handle = this.executor.executeRalphLoopAsync(taskDesc, {
              maxIterations: 5,
              onProgress: async msg => {
                try {
                  await sinkRef.send(chatId, msg);
                } catch {
                  /* ignored */
                }
              },
            });
            return { promise: handle.promise, cancel: handle.cancel };
          },
          {
            description: `[RALPH] ${taskDesc}`,
            chatId: event.data.chatId,
            user: event.data.user,
            timeout: 600000, // 10 min for ralph
          }
        );

        // Record in history and continue immediately
        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: `[RALPH] ${taskDesc.slice(0, 200)}`,
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        continue; // Don't block — task runs in background
      }

      // Check if Claude wants ultrawork (parallel execution)
      if (response.startsWith('[ULTRAWORK]')) {
        const taskDesc = response.slice(11).trim();
        const taskId = `ultra-${++this.taskCounter}`;
        this.stats.tasksExecuted++;

        try {
          await sink.send(
            event.data.chatId,
            `⚡ Starting ultrawork: ${taskDesc.slice(0, 100)}...`,
            { replyTo: event.data.messageId }
          );
        } catch {
          /* ignored */
        }

        this.log(`[dispatcher] Ultrawork ${taskId}: ${taskDesc.slice(0, 80)}`);

        this.taskPool.spawn(
          taskId,
          () =>
            this.executor.executeParallelAsync(taskDesc, {
              maxParallel: 3,
              onProgress: async msg => {
                try {
                  await sink.send(event.data.chatId, msg);
                } catch {
                  /* ignored */
                }
              },
            }),
          {
            description: `[ULTRA] ${taskDesc}`,
            chatId: event.data.chatId,
            user: event.data.user,
            timeout: 600000,
          }
        );

        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: `[ULTRAWORK] ${taskDesc.slice(0, 200)}`,
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        continue;
      }

      // Check if Claude wants to execute a single task
      if (response.startsWith('[TASK]')) {
        const taskDesc = response.slice(6).trim();
        const taskId = `task-${++this.taskCounter}`;
        this.stats.tasksExecuted++;

        // Classify: is this a coding task or a general task?
        const classification = this.missionExecutor.classify(taskDesc);
        const isMission = classification.isCoding;
        const modeLabel = isMission
          ? `🔧 Mission task (${classification.agentType})`
          : '⚙️ Running task';

        // Notify user that task is starting — immediate feedback
        try {
          await sink.send(event.data.chatId, `${modeLabel}: ${taskDesc.slice(0, 100)}...`, {
            replyTo: event.data.messageId,
          });
        } catch {
          /* ignored */
        }

        this.log(
          `[dispatcher] Executing ${isMission ? 'mission' : 'plain'} task ${taskId}: ${taskDesc.slice(0, 80)}`
        );

        // Spawn into task pool — non-blocking
        const cancelRef = { cancel: null };
        const sinkRef = sink;
        const chatId = event.data.chatId;
        const intervalMs = this._progressIntervalMs;
        const intervalSec = Math.round(intervalMs / 1000);
        const missionExec = this.missionExecutor;

        this.taskPool.spawn(
          taskId,
          () => {
            // Route to mission executor for coding, standard executor otherwise
            const handle = isMission
              ? missionExec.executeAsync(taskDesc)
              : this.executor.executeTaskAsync(taskDesc);
            cancelRef.cancel = handle.cancel;

            // Start heartbeat now that the task is actually running
            let progressCount = 0;
            const progressTimer = setInterval(async () => {
              progressCount++;
              const elapsed = progressCount * intervalSec;
              try {
                await sinkRef.send(chatId, `⏳ Still working... (${elapsed}s)`);
              } catch {
                /* ignored */
              }
            }, intervalMs);

            // For mission tasks, format the result before delivery
            const resultPromise = handle.promise.then(result => {
              if (isMission && result && typeof result === 'object' && result.grade) {
                return missionExec.formatResult(result);
              }
              return result;
            });

            return resultPromise.finally(() => clearInterval(progressTimer));
          },
          {
            description: taskDesc,
            chatId: event.data.chatId,
            user: event.data.user,
            timeout: 300000, // 5 min
            cancel: () => cancelRef.cancel && cancelRef.cancel(),
            _sink: sink,
            _messageId: event.data.messageId,
          }
        );

        // Record in history and continue immediately — result delivered by pool event handler
        this.history.push({
          timestamp: event.timestamp,
          user: event.data.user,
          message: event.data.text,
          response: `[TASK] ${taskDesc.slice(0, 200)}`,
          sink: route.sink || event.source,
        });
        if (this.history.length > this.maxHistory) this.history.shift();
        continue; // Don't block — task runs in background
      }

      try {
        await sink.send(event.data.chatId, response, {
          replyTo: event.data.messageId,
        });
        // Record task/ralph/ultrawork results in chat memory.
        // The renderer already recorded the [TAG] response — only add if response
        // was overridden by a task result (starts with common task output patterns).
        if (this.memory && event.data.chatId && !response.startsWith('[')) {
          // Check if this is a task result that replaced the original [TAG] response
          const chatHistory = this.memory.chats.get(event.data.chatId) || [];
          const lastMsg = chatHistory[chatHistory.length - 1];
          if (
            lastMsg &&
            lastMsg.role === 'assistant' &&
            /^\[(?:TASK|RALPH|ULTRAWORK)]/.test(lastMsg.text)
          ) {
            lastMsg.text = response.slice(0, 2000);
            this.memory._saveHistory();
          }
        }
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
        if (
          this.renderer.generateSuggestions &&
          !response.startsWith('[') &&
          event.data.text.length > 10
        ) {
          setImmediate(async () => {
            try {
              const suggestions = this.renderer.generateSuggestions(event.data.text, response);
              if (suggestions.length > 0) {
                await sink.send(
                  event.data.chatId,
                  '💡 ' + suggestions.map(s => `• ${s}`).join('\n')
                );
              }
            } catch {
              /* ignored */
            }
          });
        }
      } catch (err) {
        this.log(`[dispatcher] Sink error: ${err.message}`);
      }
    }
  }

  /**
   * Split long text into chunks that fit Telegram's message limit.
   * Splits on paragraph boundaries (\n\n) to avoid cutting mid-sentence.
   */
  _chunkText(text, maxLen = 3800) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point — prefer double newline, then single newline, then space
      let splitAt = remaining.lastIndexOf('\n\n', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(' ', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = maxLen; // Hard cut as last resort

      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    return chunks.filter(c => c.length > 0);
  }

  /**
   * Wire task pool events to handle result delivery, memory updates,
   * and skill extraction when background tasks complete.
   * @private
   */
  _wirePoolEvents() {
    // Task started — update activeTasks map
    this.taskPool.on('task-started', entry => {
      this.activeTasks.set(entry.id, {
        status: 'running',
        description: entry.description,
        startTime: entry.startTime,
        chatId: entry.chatId,
        user: entry.user,
      });
    });

    // Task completed — deliver result to chat
    this.taskPool.on('task-completed', entry => {
      const activeEntry = this.activeTasks.get(entry.id);
      if (activeEntry) {
        activeEntry.status = 'completed';
        activeEntry.endTime = entry.endTime;
      }

      const result = entry.result || 'Task completed.';
      this._deliverTaskResult(entry, result);
    });

    // Task failed — deliver error to chat
    this.taskPool.on('task-failed', entry => {
      const activeEntry = this.activeTasks.get(entry.id);
      if (activeEntry) {
        activeEntry.status = 'failed';
        activeEntry.endTime = entry.endTime;
      }

      const errMsg = `❌ Task failed: ${entry.error || 'unknown error'}`;
      this._deliverTaskResult(entry, errMsg);
    });

    // Task timeout
    this.taskPool.on('task-timeout', entry => {
      const activeEntry = this.activeTasks.get(entry.id);
      if (activeEntry) {
        activeEntry.status = 'timeout';
        activeEntry.endTime = entry.endTime;
      }

      const timeoutMsg = `⏰ Task timed out: ${entry.description.slice(0, 100)}`;
      this._deliverTaskResult(entry, timeoutMsg);
    });

    // Task cancelled
    this.taskPool.on('task-cancelled', entry => {
      const activeEntry = this.activeTasks.get(entry.id);
      if (activeEntry) {
        activeEntry.status = 'cancelled';
        activeEntry.endTime = entry.endTime;
      }
    });
  }

  /**
   * Deliver a task result to the chat that requested it.
   * Handles chunking, memory updates, skill extraction, and file attachments.
   * @private
   */
  async _deliverTaskResult(entry, result) {
    const sink = this.sinks.telegram || Object.values(this.sinks)[0];
    if (!sink) return;

    // Strip markdown headings for Telegram
    const cleanResult = result.replace(/^#{1,6}\s+/gm, '').replace(/^---+$/gm, '');

    // Chunk long results
    const chunks = this._chunkText(cleanResult, 3800);
    for (let ci = 0; ci < chunks.length; ci++) {
      try {
        await sink.send(entry.chatId, chunks[ci], {
          replyTo: ci === 0 ? entry._messageId : undefined,
        });
      } catch {
        /* ignored */
      }
    }

    this.log(`[dispatcher] Delivered ${chunks.length} chunk(s) for ${entry.id}`);

    // Update memory with task result
    if (this.memory && entry.chatId) {
      const chatHistory = this.memory.chats.get(entry.chatId) || [];
      const lastAssistant = chatHistory.findLastIndex
        ? chatHistory.findLastIndex(m => m.role === 'assistant')
        : -1;
      if (
        lastAssistant >= 0 &&
        /^\[(?:TASK|RALPH|ULTRAWORK)]/.test(chatHistory[lastAssistant].text)
      ) {
        chatHistory[lastAssistant].text = cleanResult.slice(0, 2000);
      } else {
        this.memory.addMessage(entry.chatId, 'assistant', cleanResult.slice(0, 2000));
      }
      this.memory._saveHistory();
    }

    // Skill extraction (non-blocking)
    if (this.skillStore && !result.startsWith('Error') && !result.startsWith('❌')) {
      setImmediate(() => {
        try {
          const skillName = this.skillStore.extractSkill(entry.description, result);
          if (skillName) this.log(`[dispatcher] Skill extracted: ${skillName}`);
        } catch (err) {
          this.log(`[dispatcher] Skill extraction error: ${err.message}`);
        }
      });
    }

    // File attachment detection
    if (sink.sendFile) {
      const filePaths = result.match(
        /(?:\/[\w./-]+|[A-Z]:\\[\w.\\/-]+)\.(?:md|pdf|csv|txt|json|png|jpg|svg|html|xlsx|docx)/gi
      );
      if (filePaths) {
        await this._sendExtractedFiles(sink, entry.chatId, filePaths);
      }
    }

    // Daily activity log
    if (this.memory?.appendDailyLog) {
      this.memory.appendDailyLog(entry.chatId, entry.user, entry.description, cleanResult);
    }
  }

  /** @private Send extracted file paths from task results */
  async _sendExtractedFiles(sink, chatId, filePaths) {
    for (const fp of [...new Set(filePaths)].slice(0, 3)) {
      try {
        const sent = await sink.sendFile(chatId, fp.trim());
        if (sent) this.log(`[dispatcher] Sent file: ${fp}`);
      } catch {
        /* ignored */
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing,
      runningTasks: this.taskPool.getRunning().length,
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
          .catch(e => process.stderr.write(`[WARN] approval prompt: ${e.message}\n`));
      }

      // 5-minute timeout → auto-deny
      setTimeout(() => {
        if (this.pendingApprovals.has(chatId)) {
          this.pendingApprovals.delete(chatId);
          resolve('deny');
          if (sink) {
            sink
              .send(chatId, '⏰ Approval timed out. Command cancelled.')
              .catch(e => process.stderr.write(`[WARN] approval timeout: ${e.message}\n`));
          }
        }
      }, 300000);
    });
  }
}

module.exports = { Dispatcher };
