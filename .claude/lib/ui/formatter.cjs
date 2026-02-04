#!/usr/bin/env node
'use strict';

const BANNER_WIDTH = 61;
const CHECKPOINT_WIDTH = 62;
const LINE_WIDTH = 63;

function createStageBanner(stageName) {
  const line = '━'.repeat(BANNER_WIDTH);
  return `${line}\n AGENT-STUDIO ► ${stageName}\n${line}`;
}

function createCheckpointBox(type, content, actionPrompt) {
  const topBorder = `╔${'═'.repeat(CHECKPOINT_WIDTH)}╗`;
  const bottomBorder = `╚${'═'.repeat(CHECKPOINT_WIDTH)}╝`;
  const separator = '─'.repeat(CHECKPOINT_WIDTH);
  // CHECKPOINT_WIDTH (62) - "║  CHECKPOINT: " (15) - "║" (1) = 46 chars for type + padding
  const typePadding = CHECKPOINT_WIDTH - 15 - 1;
  const typeLine = `║  CHECKPOINT: ${String(type).padEnd(typePadding)}║`;

  return `${topBorder}\n${typeLine}\n${bottomBorder}\n\n${content}\n\n${separator}\n→ ${actionPrompt}\n${separator}`;
}

function createProgressBar(percentage, segments = 10) {
  const bounded = Math.max(0, Math.min(100, Number(percentage) || 0));
  const filled = Math.floor((bounded / 100) * segments);
  const empty = segments - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `Progress: ${bar} ${bounded}%`;
}

function createStatus(symbol, text) {
  return `${symbol}  ${text}`;
}

function createSpawningIndicator(agentName, parallel = false, agentList = []) {
  if (parallel && agentList.length > 0) {
    const list = agentList.map(name => `  → ${name}`).join('\n');
    return `◆ Spawning ${agentList.length} agents in parallel...\n${list}`;
  }
  return `◆ Spawning ${agentName}...`;
}

function createCompletionIndicator(agentName, artifact) {
  return `✓ ${agentName} complete: ${artifact}`;
}

function createNextUpBlock(identifier, name, description, command, alternatives = []) {
  const separator = '─'.repeat(LINE_WIDTH);
  let result = `${separator}\n\n## ▶ Next Up\n\n**${identifier}: ${name}** — ${description}\n\n\`${command}\`\n\n<sub>\`/clear\` first → fresh context window</sub>\n\n${separator}\n`;

  if (alternatives.length > 0) {
    result += '\n**Also available:**\n';
    alternatives.forEach(alt => {
      result += `- \`${alt.command}\` — ${alt.description}\n`;
    });
    result += `\n${separator}\n`;
  }

  return result;
}

function createErrorBox(errorDescription, resolutionSteps) {
  const topBorder = `╔${'═'.repeat(CHECKPOINT_WIDTH)}╗`;
  const bottomBorder = `╚${'═'.repeat(CHECKPOINT_WIDTH)}╝`;
  // CHECKPOINT_WIDTH (62) - "║  ERROR" (8) - "║" (1) = 53 chars for padding
  const errorPadding = CHECKPOINT_WIDTH - 8 - 1;
  const header = `║  ERROR${' '.repeat(errorPadding)}║`;

  return `${topBorder}\n${header}\n${bottomBorder}\n\n${errorDescription}\n\n**To fix:** ${resolutionSteps}`;
}

function createStatusTable(rows) {
  let table = '| Phase | Status | Plans | Progress |\n';
  table += '|-------|--------|-------|----------|\n';
  rows.forEach(row => {
    table += `| ${row.phase} | ${row.status} | ${row.plans} | ${row.progress} |\n`;
  });
  return table;
}

module.exports = {
  createStageBanner,
  createCheckpointBox,
  createProgressBar,
  createStatus,
  createSpawningIndicator,
  createCompletionIndicator,
  createNextUpBlock,
  createErrorBox,
  createStatusTable,
  BANNER_WIDTH,
  CHECKPOINT_WIDTH,
  LINE_WIDTH,
};
