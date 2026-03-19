'use strict';

/**
 * Multi-Tool Export Script
 *
 * Exports agent-studio configuration and inventory in multiple formats:
 *   - JSON: structured data with metadata
 *   - Markdown: human-readable tables
 *   - CSV: spreadsheet-compatible
 *
 * @module multi-export
 */

const ExportFormat = Object.freeze({
  JSON: 'json',
  MARKDOWN: 'markdown',
  CSV: 'csv',
});

/**
 * Build a tool manifest from agent definitions.
 *
 * @param {Array<{ id: string, tools?: string[], skills?: string[] }>} agents
 * @returns {{ agentCount: number, tools: string[], skills: string[], generatedAt: string }}
 */
function buildToolManifest(agents) {
  const toolSet = new Set();
  const skillSet = new Set();

  for (const agent of agents) {
    for (const t of agent.tools || []) toolSet.add(t);
    for (const s of agent.skills || []) skillSet.add(s);
  }

  return {
    agentCount: agents.length,
    tools: [...toolSet].sort(),
    skills: [...skillSet].sort(),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Escape a CSV field.
 * @param {string} value
 * @returns {string}
 */
function csvEscape(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate export in the specified format.
 *
 * @param {{ agents: Array, skills: Array }} data
 * @param {string} format - ExportFormat value
 * @returns {string}
 */
function generateExport(data, format) {
  switch (format) {
    case ExportFormat.JSON:
      return exportJSON(data);
    case ExportFormat.MARKDOWN:
      return exportMarkdown(data);
    case ExportFormat.CSV:
      return exportCSV(data);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

function exportJSON(data) {
  return JSON.stringify(
    {
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0.0',
      },
      agents: data.agents,
      skills: data.skills,
    },
    null,
    2
  );
}

function exportMarkdown(data) {
  const lines = ['# Agent Studio Export', '', `Generated: ${new Date().toISOString()}`, ''];

  // Agents table
  lines.push('## Agents', '');
  lines.push('| ID | Type | Tools | Skills |');
  lines.push('|---|---|---|---|');
  for (const a of data.agents) {
    const tools = (a.tools || []).join(', ');
    const skills = (a.skills || []).join(', ');
    lines.push(`| ${a.id} | ${a.type || ''} | ${tools} | ${skills} |`);
  }

  // Skills table
  if (data.skills.length > 0) {
    lines.push('', '## Skills', '');
    lines.push('| Name | Category |');
    lines.push('|---|---|');
    for (const s of data.skills) {
      lines.push(`| ${s.name} | ${s.category || ''} |`);
    }
  }

  return lines.join('\n');
}

function exportCSV(data) {
  const lines = ['id,type,tools,skills'];
  for (const a of data.agents) {
    const tools = csvEscape((a.tools || []).join(', '));
    const skills = csvEscape((a.skills || []).join(', '));
    lines.push(`${csvEscape(a.id)},${csvEscape(a.type || '')},${tools},${skills}`);
  }
  return lines.join('\n');
}

module.exports = {
  ExportFormat,
  generateExport,
  buildToolManifest,
};
