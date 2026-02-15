'use strict';

function createPostTaskCompletionHelpers(deps) {
  const { fs, path, routerState, getFindingsRegistry, PROJECT_ROOT, TASKUPDATE_RECOVERY_QUEUE_PATH } =
    deps;

  const COMPLETION_INDICATORS = [
    /task.*(?:complete|completed|done|finished)/i,
    /(?:complete|completed|done|finished).*task/i,
    /successfully.*(?:complete|created|implemented|fixed)/i,
    /all.*(?:tests|checks).*pass/i,
    /implementation.*complete/i,
    /changes.*made/i,
    /summary.*(?:of|:)/i,
    /## Summary/i,
    /Task \d+ (?:is )?(?:now )?complete/i,
    /I have (?:successfully )?(?:completed|finished|done)/i,
  ];

  function detectsCompletion(output) {
    if (!output || typeof output !== 'string') return false;
    return COMPLETION_INDICATORS.some(pattern => pattern.test(output));
  }

  function formatTaskCompletionWarning(output) {
    const snippet = output.substring(0, 200).replace(/\n/g, ' ');
    return `
+======================================================================+
|  WARNING: TASK COMPLETION DETECTED WITHOUT TaskUpdate                |
+======================================================================+
|  Agent output indicates task completion, but no TaskUpdate was       |
|  recorded recently.                                                  |
|                                                                      |
|  Output snippet: "${snippet.substring(0, 50)}..."                    |
|                                                                      |
|  AGENTS MUST call TaskUpdate({ status: "completed" }) when done!     |
|                                                                      |
|  This may indicate the agent ignored task tracking instructions.     |
+======================================================================+
`;
  }

  function extractExpectedArtifactPaths(toolInput) {
    const text = `${toolInput?.prompt || ''}\n${toolInput?.description || ''}`;
    if (!text) return [];

    const results = new Set();
    const normalizeRel = raw => {
      const trimmed = String(raw || '')
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '');
      if (!trimmed) return null;
      const normalized = trimmed.replace(/\\/g, '/');
      if (!normalized.startsWith('.claude/')) return null;
      return normalized;
    };

    const backtickRe = /`([^`]*\.claude[\\/]+context[\\/]+reports[\\/][^`]+)`/gi;
    let match;
    while ((match = backtickRe.exec(text)) !== null) {
      const normalized = normalizeRel(match[1]);
      if (normalized) results.add(normalized);
    }

    const writeToRe = /(?:write|save|output)[\s\S]{0,140}?\bto:\s*([^\s\n]+)/gi;
    while ((match = writeToRe.exec(text)) !== null) {
      const normalized = normalizeRel(match[1]);
      if (normalized && normalized.includes('.claude/context/reports/')) {
        results.add(normalized);
      }
    }
    return Array.from(results);
  }

  function getMissingArtifacts(expectedPaths) {
    if (!Array.isArray(expectedPaths) || expectedPaths.length === 0) return [];
    const missing = [];
    for (const relPath of expectedPaths) {
      const abs = path.resolve(PROJECT_ROOT, relPath);
      try {
        const stat = fs.statSync(abs);
        if (!stat.isFile() || stat.size === 0) missing.push(relPath);
      } catch (_err) {
        missing.push(relPath);
      }
    }
    return missing;
  }

  function ingestExpectedReportFindings(expectedPaths, metadata = {}) {
    if (!Array.isArray(expectedPaths) || expectedPaths.length === 0) {
      return { ingested: 0, errors: [] };
    }

    const registry = getFindingsRegistry();
    if (!registry || typeof registry.ingestReportFindings !== 'function') {
      return { ingested: 0, errors: [] };
    }

    const errors = [];
    let ingested = 0;
    for (const relPath of expectedPaths) {
      try {
        const absPath = path.resolve(PROJECT_ROOT, relPath);
        const result = registry.ingestReportFindings(PROJECT_ROOT, absPath, metadata);
        ingested += Number(result?.added || 0);
      } catch (err) {
        errors.push({ path: relPath, error: err?.message || String(err) });
      }
    }
    return { ingested, errors };
  }

  function resolveFindingsFromTaskCompletion(toolOutput, metadata = {}) {
    const text = String(toolOutput || '');
    if (!text || text.length < 30) return { resolved: 0, reviewed: 0 };

    const registry = getFindingsRegistry();
    if (!registry || typeof registry.resolveFindingsFromCompletion !== 'function') {
      return { resolved: 0, reviewed: 0 };
    }

    try {
      return registry.resolveFindingsFromCompletion(PROJECT_ROOT, text, metadata);
    } catch (_err) {
      return { resolved: 0, reviewed: 0 };
    }
  }

  function recordFindingsTrendSnapshot(source = 'post-task-unified') {
    const registry = getFindingsRegistry();
    if (!registry || typeof registry.recordFindingsTrendSnapshot !== 'function') {
      return null;
    }

    try {
      return registry.recordFindingsTrendSnapshot(PROJECT_ROOT, source);
    } catch (_err) {
      return null;
    }
  }

  function synthesizeRecoveryTaskUpdate(taskId, reason, retryHint, details = {}) {
    try {
      const dir = path.dirname(TASKUPDATE_RECOVERY_QUEUE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const record = {
        timestamp: new Date().toISOString(),
        sessionId: process.env.CLAUDE_SESSION_ID || null,
        taskId: taskId || null,
        status: 'in_progress',
        synthetic: true,
        reason,
        retryHint,
        details,
      };

      fs.appendFileSync(TASKUPDATE_RECOVERY_QUEUE_PATH, `${JSON.stringify(record)}\n`, 'utf8');
      if (taskId) routerState.recordTaskUpdate(String(taskId), 'in_progress');
      return true;
    } catch (_err) {
      return false;
    }
  }

  function hasMatchingCompletedTaskUpdate(taskId) {
    const update = routerState.getLastTaskUpdate();
    if (!update || !update.timestamp) return false;
    if (Date.now() - update.timestamp > 120000) return false;
    if (!update.taskId || !update.status) return false;

    const normalizedStatus = String(update.status).toLowerCase();
    if (normalizedStatus !== 'completed') return false;
    if (taskId == null) return true;
    return String(update.taskId) === String(taskId);
  }

  function runTaskCompletionGuard(toolOutput, taskId = null, toolInput = null) {
    const enforcement = process.env.TASK_COMPLETION_GUARD || 'block';
    if (enforcement === 'off') return { pass: true };
    if (!toolOutput || !detectsCompletion(toolOutput)) return { pass: true };

    const expectedArtifacts = extractExpectedArtifactPaths(toolInput);
    const missingArtifacts = getMissingArtifacts(expectedArtifacts);
    if (missingArtifacts.length > 0) {
      const missingMessage =
        '[TASK ARTIFACT CONTRACT] Completion detected but expected artifacts are missing: ' +
        `${missingArtifacts.join(', ')}. Use Write/Edit tool to create required report file(s) before completion.`;
      synthesizeRecoveryTaskUpdate(
        taskId,
        'missing_expected_artifact',
        'Create missing artifact files with Write/Edit, then call TaskUpdate({status:"completed"}).',
        { expectedArtifacts, missingArtifacts }
      );

      if (enforcement === 'warn') {
        return { pass: true, result: 'warn', message: missingMessage };
      }
      return { pass: false, result: 'block', message: missingMessage };
    }

    ingestExpectedReportFindings(expectedArtifacts, {
      taskId: taskId || null,
      agentType: toolInput?.subagent_type || null,
    });
    resolveFindingsFromTaskCompletion(toolOutput, {
      taskId: taskId || null,
      agentType: toolInput?.subagent_type || null,
    });
    recordFindingsTrendSnapshot('post-task-guard');

    const wasUpdated = hasMatchingCompletedTaskUpdate(taskId);
    if (wasUpdated) {
      if (process.env.DEBUG_HOOKS) {
        console.error('[post-task-unified] Agent properly called TaskUpdate');
      }
      return { pass: true };
    }

    const warning = formatTaskCompletionWarning(toolOutput);
    synthesizeRecoveryTaskUpdate(
      taskId,
      'missing_taskupdate_completed',
      'Call TaskUpdate({ taskId, status: "completed", metadata: { summary, filesModified } }) before finishing.',
      {
        completionDetected: true,
        hasRecentMatchingTaskUpdate: false,
      }
    );

    if (enforcement === 'warn') {
      console.error(warning);
      return { pass: true, result: 'warn', message: warning };
    }

    return {
      pass: false,
      result: 'block',
      message:
        warning +
        '\nTask() output indicated completion, but no matching TaskUpdate({ taskId, status: "completed" }) was detected.',
    };
  }

  return {
    COMPLETION_INDICATORS,
    detectsCompletion,
    hasMatchingCompletedTaskUpdate,
    extractExpectedArtifactPaths,
    getMissingArtifacts,
    ingestExpectedReportFindings,
    resolveFindingsFromTaskCompletion,
    recordFindingsTrendSnapshot,
    synthesizeRecoveryTaskUpdate,
    runTaskCompletionGuard,
  };
}

module.exports = {
  createPostTaskCompletionHelpers,
};
