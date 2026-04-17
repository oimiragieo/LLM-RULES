'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  getEnforcementMode: defaultGetEnforcementMode,
  formatResult: defaultFormatHookResult,
} = require('../../lib/utils/hook-input.cjs');

const ENFORCED_CREATOR_SKILLS = [
  'agent-creator',
  'command-creator',
  'rule-creator',
  'tool-creator',
  'hook-creator',
  'semgrep-rule-creator',
  'skill-creator',
  'template-creator',
  'workflow-creator',
];

function getActiveCreatorsStateFile() {
  return path.join(PROJECT_ROOT, '.claude/context/runtime/active-creators.json');
}

function getTaskOutputContractsPath() {
  return (
    process.env.TASK_OUTPUT_CONTRACTS_PATH ||
    path.join(PROJECT_ROOT, '.claude/context/runtime/task-output-contracts.json')
  );
}

function getTaskOutputMetricsPath() {
  return (
    process.env.TASK_OUTPUT_METRICS_PATH ||
    path.join(PROJECT_ROOT, '.claude/context/runtime/task-output-enforcement-metrics.json')
  );
}

function getCreatorEcosystemValidatorPath() {
  return (
    process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH ||
    path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-creator-ecosystem.cjs')
  );
}

function getSkillEcosystemValidatorPath() {
  return (
    process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH ||
    path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-skill-ecosystem.cjs')
  );
}

function getAgentSkillReferenceValidatorPath() {
  return (
    process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH ||
    path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-agent-skill-references.cjs')
  );
}

function readActiveCreatorSkills() {
  try {
    const activeCreatorsStateFile = getActiveCreatorsStateFile();
    if (!fs.existsSync(activeCreatorsStateFile)) return [];

    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const state = safeParseJSON(fs.readFileSync(activeCreatorsStateFile, 'utf8'), null, null, {});

    return Object.entries(state)
      .filter(([, value]) => value && value.active)
      .map(([key]) => key);
  } catch (_error) {
    return [];
  }
}

function hasCreatorKeyword(text = '') {
  const normalized = String(text).toLowerCase();
  return ENFORCED_CREATOR_SKILLS.some(skill => normalized.includes(skill));
}

function isEcosystemCreatorAction(params = {}) {
  const metadata = params.metadata || {};
  const filesTouched = [...(metadata.filesCreated || []), ...(metadata.filesModified || [])].map(
    file => String(file).replace(/\\/g, '/').toLowerCase()
  );

  const touchedCreatorDomains = filesTouched.some(file =>
    [
      '/.claude/skills/',
      '/.claude/agents/',
      '/.claude/hooks/',
      '/.claude/workflows/',
      '/.claude/templates/',
      '/.claude/commands/',
      '/.claude/rules/',
      '/.claude/tools/',
    ].some(prefix => file.includes(prefix))
  );

  const textSignal = [metadata.summary, metadata.subject, params.taskId, params.task_id]
    .filter(Boolean)
    .some(value => hasCreatorKeyword(value));

  const activeCreatorSignal = readActiveCreatorSkills().some(skill =>
    ENFORCED_CREATOR_SKILLS.includes(skill)
  );

  return touchedCreatorDomains || textSignal || activeCreatorSignal;
}

function runValidatorScript(scriptPath, args = [], fallbackIssue = 'Validation failed') {
  try {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      windowsHide: true,
    });

    if (result.status === 0) return { passed: true, issues: [] };

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const issues = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- ') || line.length > 0)
      .slice(0, 10)
      .map(line => (line.startsWith('- ') ? line.slice(2) : line));

    return {
      passed: false,
      issues: issues.length > 0 ? issues : [fallbackIssue],
    };
  } catch (error) {
    return { passed: false, issues: [`${fallbackIssue}: ${error.message}`] };
  }
}

function validateCreatorEcosystem() {
  const creatorValidation = runValidatorScript(
    getCreatorEcosystemValidatorPath(),
    [],
    'Creator ecosystem validation failed'
  );
  const skillValidation = runValidatorScript(
    getSkillEcosystemValidatorPath(),
    ['--min-score', '70'],
    'Skill ecosystem gate failed'
  );
  const agentSkillReferenceValidation = runValidatorScript(
    getAgentSkillReferenceValidatorPath(),
    [],
    'Agent skill reference validation failed'
  );

  const issues = [
    ...creatorValidation.issues,
    ...skillValidation.issues,
    ...agentSkillReferenceValidation.issues,
  ];

  return { passed: issues.length === 0, issues };
}

function readTaskOutputContracts() {
  try {
    const taskOutputContractsPath = getTaskOutputContractsPath();
    if (!fs.existsSync(taskOutputContractsPath)) return { tasks: {} };

    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const parsed = safeParseJSON(fs.readFileSync(taskOutputContractsPath, 'utf8'), null, null, {});
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object') {
      return { tasks: {} };
    }

    return { tasks: parsed.tasks || {} };
  } catch (_error) {
    return { tasks: {} };
  }
}

function resolveRequiredOutputsForTask(taskId, params = {}) {
  const contracts = readTaskOutputContracts();
  const contractOutputs = contracts.tasks?.[String(taskId)]?.requiredOutputs;
  const metadata = params.metadata && typeof params.metadata === 'object' ? params.metadata : {};
  const declared = metadata.requiredOutputs || metadata.required_outputs || [];
  const fromParams = [];

  if (Array.isArray(declared)) {
    for (const output of declared) {
      if (typeof output === 'string') {
        fromParams.push(output);
      } else if (output && typeof output === 'object') {
        fromParams.push(output.path || output.file_path || output.filePath || '');
      }
    }
  }

  const raw = [...(Array.isArray(contractOutputs) ? contractOutputs : []), ...fromParams]
    .map(item => String(item || '').trim())
    .filter(Boolean);
  const seen = new Set();
  const normalized = [];
  for (const entry of raw) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }

  return normalized;
}

function resolveOutputPath(outputPath) {
  const normalized = String(outputPath || '').trim();
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return normalized;
  return path.resolve(PROJECT_ROOT, normalized);
}

function isReadSafetyPlaceholderPath(targetPath) {
  const basename = path.basename(String(targetPath || '')).toLowerCase();
  return basename.startsWith('read-safety-blocked-read');
}

function hasPlaceholderMarker(content) {
  const text = String(content || '');
  return (
    text.includes('# Missing Report Placeholder') ||
    text.includes('# Read Safety Blocked Target') ||
    text.includes('NON-DELIVERABLE')
  );
}

function validateRequiredOutputs(requiredOutputs) {
  const missing = [];
  const invalid = [];
  for (const output of requiredOutputs) {
    const resolved = resolveOutputPath(output);
    if (!resolved || !fs.existsSync(resolved)) {
      missing.push(output);
      continue;
    }
    if (isReadSafetyPlaceholderPath(resolved)) {
      invalid.push(output);
      continue;
    }
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      if (hasPlaceholderMarker(content)) {
        invalid.push(output);
      }
    } catch (_error) {
      invalid.push(output);
    }
  }

  return { passed: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function incrementTaskOutputMetric(counterName) {
  try {
    const taskOutputMetricsPath = getTaskOutputMetricsPath();
    const now = new Date().toISOString();
    let state = { counters: {}, updatedAt: now };

    if (fs.existsSync(taskOutputMetricsPath)) {
      try {
        const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
        const parsed = safeParseJSON(
          fs.readFileSync(taskOutputMetricsPath, 'utf8'),
          null,
          null,
          {}
        );
        if (parsed && typeof parsed === 'object') {
          state = {
            counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
            updatedAt: parsed.updatedAt || now,
          };
        }
      } catch (_error) {
        // Reset invalid metrics state.
      }
    }

    const key = String(counterName || '').trim();
    if (!key) return;

    state.counters[key] = Number(state.counters[key] || 0) + 1;
    state.updatedAt = now;
    fs.mkdirSync(path.dirname(taskOutputMetricsPath), { recursive: true });
    fs.writeFileSync(taskOutputMetricsPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (_error) {
    // Best effort only.
  }
}

function enforceRequiredOutputs(
  completionTaskId,
  toolParams,
  {
    getEnforcementMode = defaultGetEnforcementMode,
    formatHookResult = defaultFormatHookResult,
  } = {}
) {
  const requiredOutputs = resolveRequiredOutputsForTask(completionTaskId, toolParams);
  const taskOutputMode = getEnforcementMode('TASK_OUTPUT_ENFORCEMENT', 'block');
  if (taskOutputMode === 'off' || !completionTaskId || requiredOutputs.length === 0) return;

  const outputValidation = validateRequiredOutputs(requiredOutputs);
  if (outputValidation.passed) return;

  incrementTaskOutputMetric('artifact_completion_blocked');
  if (outputValidation.invalid.length > 0) {
    incrementTaskOutputMetric('placeholder_attempt_detected');
  }

  const lines = ['REQUIRED OUTPUT VALIDATION FAILED'];
  if (outputValidation.missing.length > 0) {
    lines.push('Missing required outputs:');
    for (const item of outputValidation.missing) lines.push(`- ${item}`);
  }
  if (outputValidation.invalid.length > 0) {
    lines.push('Invalid placeholder outputs:');
    for (const item of outputValidation.invalid) lines.push(`- ${item}`);
  }

  const validationMessage = lines.join('\n');
  if (taskOutputMode === 'warn') {
    console.warn(`[WARN] ${validationMessage}`);
    return;
  }

  console.log(formatHookResult('block', validationMessage));
  process.exit(2);
}

module.exports = {
  readActiveCreatorSkills,
  isEcosystemCreatorAction,
  validateCreatorEcosystem,
  resolveRequiredOutputsForTask,
  validateRequiredOutputs,
  enforceRequiredOutputs,
};
