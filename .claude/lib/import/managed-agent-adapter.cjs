// Agent: nodejs-pro | Task: #S4 | Session: 2026-04-20
// @ts-check
/**
 * Managed Agent Adapter
 * =====================
 * Pure adapter (no network I/O) that converts an Anthropic Managed Agents
 * export JSON (public beta shape) into an agent-studio v3.0.0 agent definition.
 *
 * DR-3 NOTE: The Anthropic Managed Agents API is in public beta as of 2026-04-08.
 * The schema used here is based on the best-available published shape from Anthropic
 * blog + plan research. This adapter is swappable without CLI changes; update the
 * field mappings here when the GA schema is published.
 *
 * TODO (GA refinement): Replace field guesses below with GA-confirmed field names
 * once the Managed Agents API reaches general availability.
 *
 * @module lib/import/managed-agent-adapter
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert any string to a valid agent-studio agent_id (lowercase-kebab-case).
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'imported-agent'
  );
}

/**
 * Map Anthropic model name to agent-studio preferred_model enum.
 * Falls back to 'sonnet' for unknowns.
 * @param {string|undefined} model
 * @returns {string}
 */
function mapModel(model) {
  if (!model) return 'sonnet';
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet-4-6')) return 'claude-sonnet-4-6';
  if (m.includes('sonnet-4-5')) return 'claude-sonnet-4-5';
  if (m.includes('sonnet')) return 'sonnet';
  return 'sonnet';
}

/**
 * Map Anthropic memory.persistence to agent-studio memory_tier.
 * @param {object|undefined} memory
 * @returns {string}
 */
function mapMemoryTier(memory) {
  if (!memory) return 'STM';
  const persistence = (memory.persistence || memory.type || '').toLowerCase();
  if (persistence === 'permanent' || persistence === 'ltm') return 'LTM';
  if (persistence === 'cross-session' || persistence === 'mtm') return 'MTM';
  if (persistence === 'none' || persistence === 'stateless') return 'NONE';
  return 'STM'; // default: session-scoped
}

/**
 * Map Anthropic memory.persistence to agent-studio session_type.
 * @param {object|undefined} memory
 * @returns {string}
 */
function mapSessionType(memory) {
  if (!memory) return 'ephemeral';
  const persistence = (memory.persistence || memory.type || '').toLowerCase();
  if (persistence === 'permanent' || persistence === 'ltm') return 'persistent';
  if (persistence === 'cross-session') return 'persistent';
  return 'ephemeral';
}

// Tool types that have direct local equivalents in agent-studio
const KNOWN_TOOL_TYPES = new Set([
  'custom',
  'anthropic_builtin',
  'function',
  'computer_use',
  'bash',
  'text_editor',
  'web_search',
]);

/**
 * Classify tools: known (mappable to capabilities) vs unknown (warn + skip).
 * @param {Array<{name:string, description?:string, type?:string}>} tools
 * @returns {{ known: Array, unknown: Array }}
 */
function classifyTools(tools) {
  if (!Array.isArray(tools)) return { known: [], unknown: [] };
  const known = [];
  const unknown = [];
  for (const tool of tools) {
    const type = (tool.type || 'custom').toLowerCase();
    if (KNOWN_TOOL_TYPES.has(type)) {
      known.push(tool);
    } else {
      unknown.push(tool);
    }
  }
  return { known, unknown };
}

/**
 * Map known tools to agent-studio capabilities array entries.
 * @param {Array} knownTools
 * @returns {Array<{tool_name: string, allowed: boolean}>}
 */
function mapCapabilities(knownTools) {
  // Base capability set for all imported agents
  const base = [
    { tool_name: 'Read', allowed: true },
    { tool_name: 'Write', allowed: false },
    { tool_name: 'Edit', allowed: false },
    { tool_name: 'Bash', allowed: false },
    { tool_name: 'Task', allowed: false },
  ];

  // Add entries for each mapped custom tool (as metadata, not blocking)
  for (const tool of knownTools) {
    if (tool.name) {
      base.push({ tool_name: tool.name, allowed: true });
    }
  }

  return base;
}

/**
 * Build provenance header string for the generated agent .md file.
 * @param {string} _agentId
 * @param {string} sourceId
 * @returns {string}
 */
function buildProvenance(_agentId, sourceId) {
  const date = new Date().toISOString().split('T')[0];
  return `<!-- Agent: imported | Source: anthropic-managed-agents/${sourceId} | Session: ${date} -->`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert a Managed Agent export JSON to agent-studio agent definition.
 *
 * @param {object} managedAgentJson - The raw JSON from Anthropic Managed Agents export API
 * @returns {{
 *   agentFrontmatter: object,
 *   manifest: object,
 *   agentMd: string,
 *   importReport: { warnings: string[], skippedTools: string[], mappedTools: string[] }
 * }}
 */
function convertManagedAgent(managedAgentJson) {
  const src = managedAgentJson || {};

  const sourceId = src.id || 'unknown';
  const rawName = src.name || src.id || 'imported-agent';
  const agentId = slugify(rawName);
  const description = src.description || `Imported from Anthropic Managed Agents (id: ${sourceId})`;
  const systemPrompt = src.system_prompt || '';
  const model = src.model;
  const memory = src.memory;

  const { known: knownTools, unknown: unknownTools } = classifyTools(src.tools);

  // Build warnings for unknown tools
  const warnings = unknownTools.map(
    t =>
      `Tool '${t.name}' (type: '${t.type || 'unknown'}') has no local agent-studio equivalent — skipped. ` +
      `Manual mapping required after import.`
  );

  const importReport = {
    warnings,
    skippedTools: unknownTools.map(t => t.name),
    mappedTools: knownTools.map(t => t.name),
  };

  // Build manifest
  const manifest = {
    manifest_version: '1.0',
    agent_id: agentId,
    agent_type: 'imported',
    capabilities: mapCapabilities(knownTools),
    memory_tier: mapMemoryTier(memory),
    cost_envelope: {
      max_tokens_per_task: 100000,
      max_usd_per_session: 2.0,
      preferred_model: mapModel(model),
    },
    session_type: mapSessionType(memory),
    a2a_interop: {
      supports_mcp: true,
      supports_aip_tokens: false,
      supports_maf: false,
    },
  };

  // Build frontmatter (agent .md YAML block)
  const agentFrontmatter = {
    name: agentId,
    description,
    model: mapModel(model),
    tools: knownTools.map(t => t.name),
    source_id: sourceId,
    imported_from: 'anthropic-managed-agents',
  };

  // Build full agent .md content
  const warningBlock =
    importReport.warnings.length > 0
      ? `\n<!-- IMPORT WARNINGS:\n${importReport.warnings.map(w => `  - ${w}`).join('\n')}\n-->\n`
      : '';

  const agentMd = `${buildProvenance(agentId, sourceId)}
---
name: ${agentId}
description: "${description.replace(/"/g, '\\"')}"
model: ${mapModel(model)}
tools:
${knownTools.map(t => `  - ${t.name}`).join('\n') || '  []'}
imported_from: anthropic-managed-agents
source_id: "${sourceId}"
---
${warningBlock}
# ${rawName}

> **Imported Agent** — Auto-converted from Anthropic Managed Agents (id: \`${sourceId}\`)
>
> Review and customise this agent before production use.

## Description

${description}

## System Prompt

${systemPrompt ? `\`\`\`\n${systemPrompt}\n\`\`\`` : '_No system prompt captured._'}

## Mapped Tools

${
  knownTools.length > 0
    ? knownTools.map(t => `- **${t.name}**: ${t.description || ''}`).join('\n')
    : '_No tools mapped._'
}

${importReport.skippedTools.length > 0 ? `## Skipped Tools (no local equivalent)\n\n${importReport.skippedTools.map(n => `- \`${n}\``).join('\n')}` : ''}
`;

  return {
    agentFrontmatter,
    manifest,
    agentMd,
    importReport,
  };
}

module.exports = { convertManagedAgent, slugify, mapModel, mapMemoryTier };
