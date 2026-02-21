'use strict';

const fs = require('fs');
const path = require('path');
const { LANCEDB_DIR } = require('../../lib/memory/memory-paths.cjs');

function createReflectionActions({
  projectRoot,
  isEnabled,
  appendJsonl,
  auditLog,
  debugLog,
  mlIndex,
  reflectionQueueMaxLines,
}) {
  function queueReflection(entry, queueFile) {
    if (!isEnabled()) {
      return;
    }

    try {
      const queueDir = path.dirname(queueFile);
      if (!fs.existsSync(queueDir)) {
        fs.mkdirSync(queueDir, { recursive: true });
      }

      appendJsonl(queueFile, entry, { maxLines: reflectionQueueMaxLines });

      const mode = process.env.REFLECTION_HOOK_MODE || 'block';
      if (mode === 'warn') {
        const trigger = entry.trigger || 'unknown';
        const id = entry.taskId || entry.sessionId || entry.tool || 'unknown';
        auditLog('unified-reflection', 'queued', { trigger, id });
      }
    } catch (err) {
      debugLog('unified-reflection', 'Error queueing reflection', err);
    }
  }

  async function recordSession(sessionData) {
    if (!isEnabled()) {
      return;
    }

    try {
      let memoryTiers = null;
      try {
        memoryTiers = require(
          path.join(projectRoot, '.claude', 'lib', 'memory', 'memory-tiers.cjs')
        );
      } catch (_e) {
        debugLog(
          'unified-reflection',
          'memory-tiers not available; session recording skipped (memory-tiers required for session persistence)'
        );
        return;
      }

      await memoryTiers.writeSTMEntry(sessionData, projectRoot);
      await memoryTiers.consolidateSession(sessionData.session_id, projectRoot);

      if (process.env.DEBUG_HOOKS) {
        debugLog(
          'unified-reflection',
          `Session recorded via memory-tiers: ${sessionData.session_id}`
        );
      }
    } catch (err) {
      debugLog('unified-reflection', 'Error recording session', err);
    }
  }

  async function triggerEmbeddingGeneration(sessionData) {
    if (!isEnabled()) {
      return;
    }

    const filesModified = Array.isArray(sessionData?.files_modified)
      ? sessionData.files_modified
      : [];
    if (filesModified.length === 0) {
      return;
    }

    const memoryDir = path.resolve(projectRoot, '.claude', 'context', 'memory');
    const memoryFiles = filesModified
      .filter(f => typeof f === 'string' && f.toLowerCase().endsWith('.md'))
      .map(f => (path.isAbsolute(f) ? path.resolve(f) : path.resolve(projectRoot, f)))
      .filter(fullPath => {
        const resolved = path.resolve(fullPath);
        if (resolved === memoryDir) return false;
        return resolved.startsWith(memoryDir + path.sep);
      })
      .filter(fullPath => fs.existsSync(fullPath));

    if (memoryFiles.length === 0) {
      return;
    }

    try {
      const { MemoryVectorStore } = require('../../lib/memory/lancedb-client.cjs');
      const embeddings = require('../../tools/cli/generate-embeddings.cjs');

      const vectorStore = new MemoryVectorStore({
        persistDirectory: process.env.LANCEDB_URI || LANCEDB_DIR,
        collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
      });

      const available = await vectorStore.isAvailable();
      if (!available) {
        debugLog('unified-reflection', 'LanceDB not available, skipping embedding generation');
        return;
      }

      for (const fullPath of memoryFiles) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const chunks = embeddings.chunkByHeaders(content, fullPath);
          if (chunks.length === 0) continue;

          const docs = chunks.map(chunk => {
            const metadata = embeddings.extractMetadata(fullPath, chunk.section, chunk.line);
            return {
              id: `${metadata.filePath}-${chunk.line}`,
              text: `${chunk.section}\n\n${chunk.content}`,
              metadata,
            };
          });

          await vectorStore.upsertDocuments(docs);
        } catch (err) {
          debugLog('unified-reflection', `Error processing file ${fullPath}`, err);
        }
      }

      if (process.env.DEBUG_HOOKS) {
        debugLog('unified-reflection', `Generated embeddings for ${memoryFiles.length} files`);
      }
    } catch (err) {
      debugLog('unified-reflection', 'Error in embedding generation workflow', err);
    }
  }

  function triggerMLSessionEnd(result) {
    if (!mlIndex || !mlIndex.isMLEnabled()) return;

    try {
      const toSafeInt = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.trunc(n) : fallback;
      };

      const bucketize = (value, thresholds, labels) => {
        const v = Math.max(0, toSafeInt(value, 0));
        for (let i = 0; i < thresholds.length; i++) {
          if (v < thresholds[i]) return labels[i];
        }
        return labels[labels.length - 1];
      };

      const stats = result.reflection?.stats || {};
      const errorReview = result.reflection?.errorReview || {};
      const sessionData = result.sessionData || {};

      const tasksCompleted = Array.isArray(sessionData.tasks_completed)
        ? sessionData.tasks_completed
        : [];
      const filesModified = Array.isArray(sessionData.files_modified)
        ? sessionData.files_modified
        : [];

      const tasksCount = Math.max(tasksCompleted.length, toSafeInt(stats.tasksCompleted, 0), 0);
      const historyLen = Math.min(Math.max(tasksCount, 1), 200);
      const toolCalls = toSafeInt(stats.toolCalls, 0);
      const toolCallsBucket = bucketize(toolCalls, [1, 10, 50], ['none', 'low', 'med', 'high']);
      const filesModifiedCount = filesModified.length;
      const filesModifiedBucket = bucketize(
        filesModifiedCount,
        [1, 5, 20],
        ['none', 'low', 'med', 'high']
      );

      const history = Array.from({ length: historyLen }, () => {
        const tools = ['Task', `toolCalls:${toolCallsBucket}`];
        if (filesModifiedCount > 0) {
          tools.push(`filesModified:${filesModifiedBucket}`);
        }
        return { agent: 'session', tools };
      });

      const totalDuration =
        toSafeInt(sessionData.totalDuration, null) ??
        toSafeInt(sessionData.duration_ms, null) ??
        toSafeInt(sessionData.durationMs, null) ??
        0;
      const tokenUsage =
        toSafeInt(sessionData.tokenUsage, null) ??
        toSafeInt(sessionData.token_usage, null) ??
        (toolCalls > 0 ? toolCalls * 500 : 0);
      const peakMemoryMB =
        toSafeInt(sessionData.peakMemoryMB, null) ??
        toSafeInt(sessionData.peak_memory_mb, null) ??
        toSafeInt(sessionData.peakMemoryMb, null) ??
        0;

      const sessionForML = {
        history,
        metrics: {
          totalDuration,
          errorCount: toSafeInt(stats.errors, 0),
          tokenUsage,
          peakMemoryMB,
          criticalErrors: toSafeInt(errorReview.criticalIssues, 0),
        },
        trace: {
          tasksCount,
          filesModifiedCount,
          toolCalls,
        },
      };

      const mlContextDir = path.join(projectRoot, '.claude', 'context', 'ml');
      const persistence = {
        modelPath: process.env.ML_MODEL_PATH || path.join(mlContextDir, 'pattern-model.json'),
        policyPath:
          process.env.ML_POLICY_PATH || path.join(mlContextDir, 'optimization-policies.json'),
        statePath:
          process.env.ML_FEEDBACK_STATE_PATH || path.join(mlContextDir, 'feedback-loop-state.json'),
        sessionsPath: process.env.ML_SESSIONS_LOG_PATH || path.join(mlContextDir, 'sessions.jsonl'),
      };

      const feedback = mlIndex.getFeedbackLoop(persistence);
      if (feedback) {
        feedback.process(sessionForML);
      }

      const engine = feedback?.optimizationEngine || mlIndex.getOptimizationEngine(persistence);
      if (engine && engine.isReady().ready) {
        const recommendation = engine.optimize(sessionForML);
        const mode = mlIndex.getMLAutomationMode();
        if (recommendation && (mode === 'log' || mode === 'enforce')) {
          debugLog(
            'unified-reflection',
            'ML optimization recommendation (advice-only)',
            recommendation
          );
        }
      }
    } catch (err) {
      debugLog('unified-reflection', 'ML session-end failed', err);
    }
  }

  function triggerMaintenance() {
    if (!isEnabled()) {
      return;
    }

    try {
      const scheduler = require('../../lib/memory/memory-scheduler.cjs');
      scheduler.runDailyMaintenance(projectRoot);

      const status = scheduler.getMaintenanceStatus(projectRoot);
      const lastWeekly = status?.lastWeekly ? new Date(status.lastWeekly) : null;
      const daysSinceWeekly = lastWeekly
        ? (Date.now() - lastWeekly.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (daysSinceWeekly >= 7) {
        scheduler.runWeeklyMaintenance(projectRoot);
        debugLog('unified-reflection', 'Weekly maintenance completed');
      } else {
        debugLog(
          'unified-reflection',
          `Weekly maintenance not due (${Math.round(daysSinceWeekly * 10) / 10} days since last run)`
        );
      }
    } catch (err) {
      debugLog('unified-reflection', 'Error running maintenance', err);
    }
  }

  function triggerObservationCompaction() {
    if (!isEnabled()) {
      return;
    }

    const compactToggle = String(process.env.OBSERVATIONS_COMPACT_ON_SESSION_END || 'on')
      .trim()
      .toLowerCase();
    if (compactToggle === 'off' || compactToggle === 'false' || compactToggle === '0') {
      return;
    }

    const maxObservationsRaw = Number(process.env.OBSERVATIONS_COMPACT_MAX || 50);
    const maxObservations =
      Number.isFinite(maxObservationsRaw) && maxObservationsRaw > 0
        ? Math.trunc(maxObservationsRaw)
        : 50;

    try {
      const { compactObservationsToSummary } = require('../../lib/memory/observations.cjs');
      const result = compactObservationsToSummary(projectRoot, { maxObservations });
      if (process.env.DEBUG_HOOKS) {
        debugLog('unified-reflection', 'Observation compaction complete', {
          count: result?.count || 0,
          summaryPath: result?.summaryPath,
        });
      }
    } catch (err) {
      debugLog('unified-reflection', 'Error running observation compaction', err);
    }
  }

  async function recordMemoryItems(extracted) {
    if (!isEnabled()) {
      return { recorded: 0, memoryWrites: [] };
    }

    try {
      let memoryManager;
      try {
        memoryManager = require('../../lib/memory/memory-manager.cjs');
      } catch (_e) {
        const libPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-manager.cjs');
        memoryManager = require(libPath);
      }

      let recorded = 0;
      const memoryWrites = [];
      let memoryTiers = null;
      try {
        memoryTiers = require('../../lib/memory/memory-tiers.cjs');
      } catch (_e) {
        memoryTiers = null;
      }

      for (const pattern of extracted.patterns || []) {
        const patternEntry =
          typeof pattern === 'string'
            ? { text: pattern, source: 'memory_api' }
            : { source: 'memory_api', ...pattern };
        if (memoryManager.recordPattern(patternEntry, projectRoot)) {
          recorded++;
          memoryWrites.push({
            type: 'pattern',
            source: patternEntry.source || 'memory_api',
            dedup: patternEntry.dedupStatus || 'unknown',
          });
          if (memoryTiers && typeof memoryTiers.writeSTMEntry === 'function') {
            await memoryTiers.writeSTMEntry(
              {
                type: 'pattern',
                content: patternEntry.text,
                source: patternEntry.source || 'memory_api',
                taskId: patternEntry.taskId || null,
                timestamp: new Date().toISOString(),
              },
              projectRoot
            );
          }
        }
      }

      for (const gotcha of extracted.gotchas || []) {
        const gotchaEntry =
          typeof gotcha === 'string'
            ? { text: gotcha, source: 'memory_api' }
            : { source: 'memory_api', ...gotcha };
        if (memoryManager.recordGotcha(gotchaEntry, projectRoot)) {
          recorded++;
          memoryWrites.push({
            type: 'gotcha',
            source: gotchaEntry.source || 'memory_api',
            dedup: gotchaEntry.dedupStatus || 'unknown',
          });
          if (memoryTiers && typeof memoryTiers.writeSTMEntry === 'function') {
            await memoryTiers.writeSTMEntry(
              {
                type: 'gotcha',
                content: gotchaEntry.text,
                source: gotchaEntry.source || 'memory_api',
                taskId: gotchaEntry.taskId || null,
                timestamp: new Date().toISOString(),
              },
              projectRoot
            );
          }
        }
      }

      for (const discovery of extracted.discoveries || []) {
        if (
          memoryManager.recordDiscovery(
            discovery.path,
            discovery.description,
            'general',
            projectRoot
          )
        ) {
          recorded++;
          memoryWrites.push({
            type: 'discovery',
            source: discovery.source || 'memory_api',
            dedup: 'n/a',
          });
          if (memoryTiers && typeof memoryTiers.writeSTMEntry === 'function') {
            await memoryTiers.writeSTMEntry(
              {
                type: 'discovery',
                content: discovery.description,
                source: discovery.source || 'memory_api',
                taskId: discovery.taskId || null,
                timestamp: new Date().toISOString(),
              },
              projectRoot
            );
          }
        }
      }

      if (recorded > 0 && process.env.DEBUG_HOOKS) {
        debugLog('unified-reflection', `Recorded ${recorded} memory items`);
      }
      return { recorded, memoryWrites };
    } catch (err) {
      debugLog('unified-reflection', 'Error recording memory items', err);
      return { recorded: 0, memoryWrites: [] };
    }
  }

  return {
    queueReflection,
    recordSession,
    triggerEmbeddingGeneration,
    triggerMLSessionEnd,
    triggerMaintenance,
    triggerObservationCompaction,
    recordMemoryItems,
  };
}

module.exports = {
  createReflectionActions,
};
