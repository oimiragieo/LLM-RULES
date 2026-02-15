'use strict';

const { createPostTaskCompletionHelpers } = require('./post-task-unified-completion.helpers.cjs');

function createPostTaskUnifiedHelpers(deps) {
  const {
    fs,
    path,
    getCachedState,
    routerState,
    getMemoryManager,
    PROJECT_ROOT,
    LEARNINGS_PATH,
    EVOLUTION_STATE_PATH,
    AUDIT_LOG_PATH,
  } = deps;

  const WORKFLOW_COMPLETE_MARKERS = [
    'workflow complete',
    'workflow completed',
    'all phases complete',
    'all tasks completed',
    'implementation complete',
  ];

  const LEARNING_PATTERNS = [
    /learned[:\s]+([^\n]+)/gi,
    /discovered[:\s]+([^\n]+)/gi,
    /pattern[:\s]+([^\n]+)/gi,
    /insight[:\s]+([^\n]+)/gi,
    /best practice[:\s]+([^\n]+)/gi,
    /tip[:\s]+([^\n]+)/gi,
    /note[:\s]+([^\n]+)/gi,
  ];

  function extractTaskDescription(toolInput) {
    if (!toolInput) return 'Task spawned';
    if (toolInput.description) return toolInput.description;
    if (toolInput.prompt) {
      const firstLine = toolInput.prompt.split('\n')[0];
      return firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
    }
    if (toolInput.subagent_type) return `${toolInput.subagent_type} agent`;
    return 'Task spawned';
  }

  function isPlannerSpawn(toolInput) {
    if (!toolInput) return false;
    const subagentType = (toolInput.subagent_type || '').toLowerCase();
    const description = (toolInput.description || '').toLowerCase();
    const prompt = toolInput.prompt || '';
    if (subagentType.includes('plan')) return true;
    if (description.includes('planner')) return true;
    if (prompt.includes('You are PLANNER') || prompt.includes('You are the PLANNER')) return true;
    return false;
  }

  function isSecuritySpawn(toolInput) {
    if (!toolInput) return false;
    const subagentType = (toolInput.subagent_type || '').toLowerCase();
    const description = (toolInput.description || '').toLowerCase();
    const prompt = toolInput.prompt || '';
    if (subagentType.includes('security')) return true;
    if (description.includes('security')) return true;
    if (prompt.includes('SECURITY-ARCHITECT')) return true;
    return false;
  }

  function runAgentContextTracker(toolInput) {
    const description = extractTaskDescription(toolInput);
    if (isPlannerSpawn(toolInput)) {
      routerState.markPlannerSpawned();
      if (process.env.ROUTER_DEBUG === 'true') {
        console.error('[post-task-unified] PLANNER agent detected and marked');
      }
    }
    if (isSecuritySpawn(toolInput)) {
      routerState.markSecuritySpawned();
      if (process.env.ROUTER_DEBUG === 'true') {
        console.error('[post-task-unified] SECURITY-ARCHITECT agent detected and marked');
      }
    }
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error(
        '[post-task-unified] Agent mode KEPT ACTIVE (router waiting for subagent completion)'
      );
      console.error(`[post-task-unified] Task description: ${description}`);
    }
  }

  function isWorkflowComplete(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return WORKFLOW_COMPLETE_MARKERS.some(marker => lower.includes(marker));
  }

  function extractLearnings(text) {
    if (!text || typeof text !== 'string') return [];
    const learnings = [];
    for (const pattern of LEARNING_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] && match[1].length > 10 && match[1].length < 500) {
          learnings.push(match[1].trim());
        }
      }
      pattern.lastIndex = 0;
    }
    return [...new Set(learnings)];
  }

  function appendLearnings(learnings, workflowName = 'Unknown Workflow') {
    if (!learnings || learnings.length === 0) return false;
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n## [${timestamp}] Auto-Extracted: ${workflowName}\n\n${learnings
      .map(item => `- ${item}`)
      .join('\n')}\n`;
    try {
      const dir = path.dirname(LEARNINGS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(LEARNINGS_PATH, entry);
      return true;
    } catch (err) {
      if (process.env.DEBUG_HOOKS) {
        console.error('Failed to append learnings:', err.message);
      }
      return false;
    }
  }

  function runWorkflowLearningExtraction(toolOutput, toolInput) {
    if (!isWorkflowComplete(toolOutput)) return;
    const learnings = extractLearnings(toolOutput);
    if (learnings.length > 0) {
      appendLearnings(learnings, toolInput?.description || 'Workflow');
    }
  }

  function extractPatterns(output) {
    if (!output || typeof output !== 'string') return [];
    const patterns = [];
    const indicators = [
      /(?:pattern|approach|solution|technique|best practice):\s*(.+)/gi,
      /(?:always|should|must|prefer)\s+(.{20,100})/gi,
      /(?:use|using)\s+(\w+)\s+(?:for|to|when)\s+(.{10,50})/gi,
    ];
    for (const regex of indicators) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(output)) !== null) {
        const value = match[1]?.trim();
        if (value && value.length > 10 && value.length < 200) patterns.push(value);
      }
    }
    return patterns.slice(0, 3);
  }

  function extractGotchas(output) {
    if (!output || typeof output !== 'string') return [];
    const gotchas = [];
    const indicators = [
      /(?:gotcha|pitfall|warning|caution|watch out|careful):\s*(.+)/gi,
      /(?:don't|do not|never|avoid)\s+(.{20,100})/gi,
      /(?:bug|issue|problem):\s*(.{20,150})/gi,
      /(?:fixed|resolved)\s+(?:by|with)\s+(.{20,100})/gi,
    ];
    for (const regex of indicators) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(output)) !== null) {
        const value = match[1]?.trim();
        if (value && value.length > 10 && value.length < 200) gotchas.push(value);
      }
    }
    return gotchas.slice(0, 3);
  }

  function extractDiscoveries(output) {
    if (!output || typeof output !== 'string') return [];
    const discoveries = [];
    const patterns = [
      /`([^`]+\.[a-z]{2,4})`[:\s-]+(.{10,100})/gi,
      /(?:file|module|component)\s+`?([^\s`]+\.[a-z]{2,4})`?\s+(?:is|handles|contains|manages)\s+(.{10,80})/gi,
    ];
    for (const regex of patterns) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(output)) !== null) {
        const filePath = match[1]?.trim();
        const description = match[2]?.trim();
        if (filePath && description && !filePath.includes(' ')) {
          discoveries.push({ path: filePath, description });
        }
      }
    }
    return discoveries.slice(0, 5);
  }

  function runSessionMemoryExtraction(toolOutput) {
    if (!toolOutput || typeof toolOutput !== 'string' || toolOutput.length < 50) return;
    const mm = getMemoryManager();
    if (!mm) return;

    const patterns = extractPatterns(toolOutput);
    const gotchas = extractGotchas(toolOutput);
    const discoveries = extractDiscoveries(toolOutput);
    let recorded = 0;

    for (const pattern of patterns) {
      if (mm.recordPattern && mm.recordPattern(pattern, PROJECT_ROOT)) recorded++;
    }
    for (const gotcha of gotchas) {
      if (mm.recordGotcha && mm.recordGotcha(gotcha, PROJECT_ROOT)) recorded++;
    }
    for (const discovery of discoveries) {
      if (
        mm.recordDiscovery &&
        mm.recordDiscovery(discovery.path, discovery.description, 'general', PROJECT_ROOT)
      ) {
        recorded++;
      }
    }

    if (recorded > 0 && process.env.DEBUG_HOOKS) {
      console.error(`[post-task-unified] Recorded ${recorded} items from Task output`);
    }
  }

  function runTaskListTracking() {
    routerState.setTaskListCalled();
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-task-unified] TaskList() call recorded');
    }
  }

  function getEvolutionState() {
    return getCachedState(EVOLUTION_STATE_PATH, null);
  }

  function isEvolutionCompletion(state) {
    if (!state) return false;
    if (state.currentEvolution && state.currentEvolution.phase === 'enable') return true;
    if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
      const lastEvolution = state.evolutions[state.evolutions.length - 1];
      const completedTime = lastEvolution.createdAt
        ? new Date(lastEvolution.createdAt).getTime()
        : lastEvolution.completedAt
          ? new Date(lastEvolution.completedAt).getTime()
          : 0;
      if (completedTime > 0 && Date.now() - completedTime < 5 * 60 * 1000) return true;
    }
    return false;
  }

  function getLatestEvolution(state) {
    if (!state) return null;
    if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
      return state.evolutions[state.evolutions.length - 1];
    }
    if (state.currentEvolution) return state.currentEvolution;
    return null;
  }

  function formatAuditEntry(evolution) {
    if (!evolution) {
      return (
        '[EVOLUTION] ' +
        new Date().toISOString() +
        ' | type=unknown | name=unknown | status=completed'
      );
    }
    const timestamp = evolution.completedAt || new Date().toISOString();
    const type = evolution.type || 'unknown';
    const name = evolution.name || 'unknown';
    const artifactPath = evolution.path || evolution.artifactPath || 'unknown';
    const researchReport = evolution.researchReport || 'none';
    return [
      '[EVOLUTION]',
      timestamp,
      '| type=' + type,
      '| name=' + name,
      '| path=' + artifactPath,
      '| research=' + researchReport,
      '| status=completed',
    ].join(' ');
  }

  function appendToAuditLog(entry) {
    try {
      const dir = path.dirname(AUDIT_LOG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(AUDIT_LOG_PATH, entry + '\n');
    } catch (err) {
      if (process.env.DEBUG_HOOKS) {
        console.error('Failed to write audit log:', err.message);
      }
    }
  }

  function runEvolutionAudit() {
    const enforcement = process.env.EVOLUTION_AUDIT || 'on';
    if (enforcement === 'off') return;
    const state = getEvolutionState();
    if (!isEvolutionCompletion(state)) return;
    const entry = formatAuditEntry(getLatestEvolution(state));
    appendToAuditLog(entry);
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-task-unified] Audit entry written:', entry);
    }
  }

  const completionHelpers = createPostTaskCompletionHelpers(deps);

  return {
    WORKFLOW_COMPLETE_MARKERS,
    LEARNING_PATTERNS,
    ...completionHelpers,
    extractTaskDescription,
    isPlannerSpawn,
    isSecuritySpawn,
    runAgentContextTracker,
    isWorkflowComplete,
    extractLearnings,
    appendLearnings,
    runWorkflowLearningExtraction,
    extractPatterns,
    extractGotchas,
    extractDiscoveries,
    runSessionMemoryExtraction,
    runTaskListTracking,
    getEvolutionState,
    isEvolutionCompletion,
    getLatestEvolution,
    formatAuditEntry,
    appendToAuditLog,
    runEvolutionAudit,
  };
}

module.exports = {
  createPostTaskUnifiedHelpers,
};
