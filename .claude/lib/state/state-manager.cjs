'use strict';

/**
 * State Manager — SESSION STATE digest for agent continuity
 *
 * Manages .claude/context/memory/STATE.md which provides a compact
 * machine-readable snapshot of current session state for handoff/resume.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STATE_PATH = path.resolve(
  __dirname,
  '../../context/memory/STATE.md'
);

const MAX_DECISIONS = 5;

/**
 * Parse STATE.md into a structured object.
 * @param {string} content
 * @returns {object}
 */
function parseState(content) {
  const state = {
    phase: '',
    velocity: '',
    decisions: [],
    blockers: [],
    continuity: '',
  };

  const lines = content.split('\n');
  let section = null;

  for (const line of lines) {
    if (line.startsWith('## Current Phase')) {
      section = 'phase';
      continue;
    }
    if (line.startsWith('## Velocity')) {
      section = 'velocity';
      continue;
    }
    if (line.startsWith('## Recent Decisions')) {
      section = 'decisions';
      continue;
    }
    if (line.startsWith('## Blockers')) {
      section = 'blockers';
      continue;
    }
    if (line.startsWith('## Session Continuity')) {
      section = 'continuity';
      continue;
    }
    if (line.startsWith('##')) {
      section = null;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (section === 'phase') {
      state.phase = (state.phase ? state.phase + '\n' : '') + trimmed;
    } else if (section === 'velocity') {
      state.velocity = (state.velocity ? state.velocity + '\n' : '') + trimmed;
    } else if (section === 'decisions') {
      if (trimmed.startsWith('- ')) {
        state.decisions.push(trimmed.slice(2));
      }
    } else if (section === 'blockers') {
      if (trimmed.startsWith('- ')) {
        const match = trimmed.match(/^- \[([^\]]+)\] (.+)$/);
        if (match) {
          state.blockers.push({ id: match[1], description: match[2] });
        } else {
          state.blockers.push({ id: String(state.blockers.length + 1), description: trimmed.slice(2) });
        }
      }
    } else if (section === 'continuity') {
      state.continuity = (state.continuity ? state.continuity + '\n' : '') + trimmed;
    }
  }

  return state;
}

/**
 * Serialize state object to STATE.md markdown content.
 * @param {object} state
 * @returns {string}
 */
function serializeState(state) {
  const updated = new Date().toISOString();
  const decisions = state.decisions.slice(-MAX_DECISIONS);
  const blockerLines = state.blockers.length
    ? state.blockers.map(b => `- [${b.id}] ${b.description}`).join('\n')
    : '_none_';
  const decisionLines = decisions.length
    ? decisions.map(d => `- ${d}`).join('\n')
    : '_none_';

  return `# SESSION STATE
Updated: ${updated}

## Current Phase
${state.phase || '_not set_'}

## Velocity
${state.velocity || '_not set_'}

## Recent Decisions (last ${MAX_DECISIONS})
${decisionLines}

## Blockers
${blockerLines}

## Session Continuity
${state.continuity || '_not set_'}
`;
}

/**
 * Read the current state. Returns empty state if STATE.md does not exist.
 * @param {string} [statePath]
 * @returns {object}
 */
function readState(statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  if (!fs.existsSync(filePath)) {
    return { phase: '', velocity: '', decisions: [], blockers: [], continuity: '' };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parseState(content);
}

/**
 * Initialize STATE.md with a blank template (or reset existing).
 * @param {string} [statePath]
 * @returns {object} initial state
 */
function initState(statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const state = { phase: '', velocity: '', decisions: [], blockers: [], continuity: '' };
  fs.writeFileSync(filePath, serializeState(state), 'utf8');
  return state;
}

/**
 * Update state fields. Merges updates into current state.
 * @param {object} updates — partial state fields to merge
 * @param {string} [statePath]
 * @returns {object} updated state
 */
function updateState(updates, statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  const current = readState(filePath);
  const merged = Object.assign({}, current, updates);
  // Preserve decisions and blockers arrays (don't replace with undefined)
  if (!Array.isArray(merged.decisions)) merged.decisions = current.decisions;
  if (!Array.isArray(merged.blockers)) merged.blockers = current.blockers;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, serializeState(merged), 'utf8');
  return merged;
}

/**
 * Append a decision to the decisions list (keeps last 5).
 * @param {string} decision
 * @param {string} [statePath]
 * @returns {object} updated state
 */
function addDecision(decision, statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  const current = readState(filePath);
  const decisions = [...current.decisions, decision].slice(-MAX_DECISIONS);
  return updateState({ decisions }, filePath);
}

/**
 * Add a blocker entry.
 * @param {{ id: string, description: string }} blocker
 * @param {string} [statePath]
 * @returns {object} updated state
 */
function addBlocker(blocker, statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  const current = readState(filePath);
  const blockers = [...current.blockers, blocker];
  return updateState({ blockers }, filePath);
}

/**
 * Remove a blocker by id.
 * @param {string} id
 * @param {string} [statePath]
 * @returns {object} updated state
 */
function clearBlocker(id, statePath) {
  const filePath = statePath || DEFAULT_STATE_PATH;
  const current = readState(filePath);
  const blockers = current.blockers.filter(b => b.id !== id);
  return updateState({ blockers }, filePath);
}

module.exports = {
  initState,
  updateState,
  readState,
  addDecision,
  addBlocker,
  clearBlocker,
};
