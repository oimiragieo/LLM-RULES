#!/usr/bin/env node
/**
 * Integration Health Dashboard CLI
 * ===================================
 *
 * Reports integration health of artifacts in the system.
 *
 * Features:
 * - Text output (default): Formatted text dashboard
 * - JSON output (--json): Machine-readable JSON
 * - Mermaid output (--mermaid): Mermaid diagram showing integration status
 *
 * Usage:
 *   node integration-health-dashboard.cjs
 *   node integration-health-dashboard.cjs --json
 *   node integration-health-dashboard.cjs --mermaid
 *
 * @module integration-health-dashboard
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { DEFAULT_ARTIFACT_GRAPH_PATH } = require('../../lib/workflow/artifact-graph.cjs');

// Resolve project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const GRAPH_PATH = DEFAULT_ARTIFACT_GRAPH_PATH;
const QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'integration-queue.jsonl'
);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'text',
    graphPath: GRAPH_PATH,
    queuePath: QUEUE_PATH,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '--mermaid') {
      options.format = 'mermaid';
    } else if (arg.startsWith('--graph=')) {
      options.graphPath = arg.split('=')[1];
    } else if (arg.startsWith('--queue=')) {
      options.queuePath = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Integration Health Dashboard

Usage:
  node integration-health-dashboard.cjs [options]

Options:
  --json          Output JSON format
  --mermaid       Output Mermaid diagram
  --graph=PATH    Path to artifact-graph.json (default: .claude/context/data/artifact-graph.json)
  --queue=PATH    Path to integration-queue.jsonl (default: .claude/context/runtime/integration-queue.jsonl)
  --help, -h      Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

/**
 * Load artifact graph
 */
function loadGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(graphPath, 'utf8');
    return safeParseJSON(content);
  } catch (_err) {
    return null;
  }
}

/**
 * Load integration queue
 */
function loadQueue(queuePath) {
  if (!fs.existsSync(queuePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(queuePath, 'utf8');
    const lines = content
      .trim()
      .split('\n')
      .filter(line => line.trim());
    return lines
      .map(line => {
        try {
          return safeParseJSON(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

/**
 * Calculate integration health statistics
 */
function calculateStats(graph) {
  const { ArtifactGraph } = require('../../lib/workflow/artifact-graph.cjs');
  const graphInstance = new ArtifactGraph(GRAPH_PATH);

  // Re-hydrate graph data
  graphInstance.graph = graph;

  const stats = graphInstance.getStats();
  const allNodes = graphInstance.getAllNodes();

  // Classify nodes by integration status
  let fullyIntegrated = 0;
  let partiallyIntegrated = 0;
  let orphaned = 0;

  const integrationScores = [];

  for (const node of allNodes) {
    const result = graphInstance.isFullyIntegrated(node.id);
    integrationScores.push({ id: node.id, score: result.score, missing: result.missing });

    if (result.score === 1.0) {
      fullyIntegrated++;
    } else if (result.score > 0) {
      partiallyIntegrated++;
    } else {
      orphaned++;
    }
  }

  // Count by type
  const byType = {};
  for (const node of allNodes) {
    if (!byType[node.type]) {
      byType[node.type] = {
        total: 0,
        integrated: 0,
        partial: 0,
        orphaned: 0,
      };
    }
    byType[node.type].total++;

    const result = graphInstance.isFullyIntegrated(node.id);
    if (result.score === 1.0) {
      byType[node.type].integrated++;
    } else if (result.score > 0) {
      byType[node.type].partial++;
    } else {
      byType[node.type].orphaned++;
    }
  }

  // Top connected nodes
  const nodeDegrees = allNodes.map(node => ({
    id: node.id,
    degree: graphInstance.getEdges(node.id, 'both').length,
  }));
  const topConnected = nodeDegrees.sort((a, b) => b.degree - a.degree).slice(0, 5);

  // Top orphaned nodes
  const topOrphaned = integrationScores
    .filter(s => s.score < 1.0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return {
    total: stats.nodeCount,
    fullyIntegrated,
    partiallyIntegrated,
    orphaned,
    integrationHealth: stats.integrationHealth,
    byType,
    topConnected,
    topOrphaned,
  };
}

/**
 * Format text output
 */
function formatText(stats, queue) {
  const date = new Date().toISOString().split('T')[0];

  let output = '=== Artifact Integration Health Dashboard ===\n';
  output += `Date: ${date}\n\n`;

  output += 'Summary:\n';
  output += `  Total artifacts: ${stats.total}\n`;
  output += `  Fully integrated: ${stats.fullyIntegrated} (${Math.round((stats.fullyIntegrated / stats.total) * 100)}%)\n`;
  output += `  Partially integrated: ${stats.partiallyIntegrated} (${Math.round((stats.partiallyIntegrated / stats.total) * 100)}%)\n`;
  output += `  Orphaned (no integrations): ${stats.orphaned} (${Math.round((stats.orphaned / stats.total) * 100)}%)\n`;
  output += `  Integration health: ${Math.round(stats.integrationHealth * 100)}%\n\n`;

  output += 'By Type:\n';
  for (const [type, counts] of Object.entries(stats.byType)) {
    output += `  ${type}: ${counts.total} total | ${counts.integrated} integrated | ${counts.partial} partial | ${counts.orphaned} orphaned\n`;
  }
  output += '\n';

  output += 'Top 5 Most Connected:\n';
  for (let i = 0; i < stats.topConnected.length; i++) {
    const node = stats.topConnected[i];
    output += `  ${i + 1}. ${node.id} (${node.degree} edges)\n`;
  }
  output += '\n';

  output += 'Top 5 Orphaned (Needs Integration):\n';
  if (stats.topOrphaned.length === 0) {
    output += '  None - all artifacts integrated!\n';
  } else {
    for (let i = 0; i < stats.topOrphaned.length; i++) {
      const node = stats.topOrphaned[i];
      output += `  ${i + 1}. ${node.id} (score: ${node.score.toFixed(1)}, missing: ${node.missing.join(', ')})\n`;
    }
  }
  output += '\n';

  output += 'Queue Status:\n';
  const pending = queue.filter(e => !e.processed).length;
  const processedToday = queue.filter(e => {
    if (!e.timestamp) return false;
    const entryDate = e.timestamp.split('T')[0];
    return entryDate === date && e.processed;
  }).length;
  output += `  Pending entries: ${pending}\n`;
  output += `  Processed today: ${processedToday}\n`;

  return output;
}

/**
 * Format JSON output
 */
function formatJSON(stats, queue) {
  const date = new Date().toISOString().split('T')[0];
  const pending = queue.filter(e => !e.processed).length;
  const processedToday = queue.filter(e => {
    if (!e.timestamp) return false;
    const entryDate = e.timestamp.split('T')[0];
    return entryDate === date && e.processed;
  }).length;

  return JSON.stringify(
    {
      date,
      summary: {
        total: stats.total,
        fullyIntegrated: stats.fullyIntegrated,
        partiallyIntegrated: stats.partiallyIntegrated,
        orphaned: stats.orphaned,
        integrationHealth: Math.round(stats.integrationHealth * 100),
      },
      byType: Object.entries(stats.byType).map(([type, counts]) => ({
        type,
        ...counts,
      })),
      topConnected: stats.topConnected,
      topOrphaned: stats.topOrphaned,
      queue: {
        pending,
        processedToday,
      },
    },
    null,
    2
  );
}

/**
 * Format Mermaid diagram output
 */
function formatMermaid(stats, graph) {
  let output = 'graph TD\n';

  // Only show orphaned/partial nodes and their neighbors
  const nodesToShow = new Set();
  const { ArtifactGraph } = require('../../lib/workflow/artifact-graph.cjs');
  const graphInstance = new ArtifactGraph(GRAPH_PATH);
  graphInstance.graph = graph;

  const allNodes = graphInstance.getAllNodes();

  for (const node of allNodes) {
    const result = graphInstance.isFullyIntegrated(node.id);
    if (result.score < 1.0) {
      nodesToShow.add(node.id);
      // Add neighbors
      const edges = graphInstance.getEdges(node.id, 'both');
      for (const edge of edges) {
        nodesToShow.add(edge.from);
        nodesToShow.add(edge.to);
      }
    }
  }

  // Group by type
  const byType = {};
  for (const nodeId of nodesToShow) {
    const node = graphInstance.getNode(nodeId);
    if (!node) continue;
    if (!byType[node.type]) {
      byType[node.type] = [];
    }
    byType[node.type].push(nodeId);
  }

  // Subgraphs by type
  for (const [type, nodes] of Object.entries(byType)) {
    output += `  subgraph ${type}\n`;
    for (const nodeId of nodes) {
      const safeName = nodeId.replace(/:/g, '_');
      const displayName = nodeId.split(':')[1] || nodeId;
      output += `    ${safeName}["${displayName}"]\n`;
    }
    output += `  end\n`;
  }

  // Edges
  for (const edge of graph.edges) {
    if (nodesToShow.has(edge.from) && nodesToShow.has(edge.to)) {
      const fromSafe = edge.from.replace(/:/g, '_');
      const toSafe = edge.to.replace(/:/g, '_');
      output += `  ${fromSafe} --> ${toSafe}\n`;
    }
  }

  // Class definitions
  output += '\n  classDef integrated fill:#90EE90\n';
  output += '  classDef partial fill:#FFD700\n';
  output += '  classDef orphaned fill:#FF6B6B\n';

  // Apply classes
  for (const nodeId of nodesToShow) {
    const result = graphInstance.isFullyIntegrated(nodeId);
    const safeName = nodeId.replace(/:/g, '_');
    if (result.score === 1.0) {
      output += `  class ${safeName} integrated\n`;
    } else if (result.score > 0) {
      output += `  class ${safeName} partial\n`;
    } else {
      output += `  class ${safeName} orphaned\n`;
    }
  }

  return output;
}

/**
 * Main entry point
 */
function main() {
  const options = parseArgs();

  // Load graph
  const graph = loadGraph(options.graphPath);
  if (!graph) {
    console.error(`Error: Graph file not found at ${options.graphPath}`);
    process.exit(1);
  }

  // Load queue
  const queue = loadQueue(options.queuePath);

  // Calculate stats
  const stats = calculateStats(graph);

  // Format output
  let output;
  if (options.format === 'json') {
    output = formatJSON(stats, queue);
  } else if (options.format === 'mermaid') {
    output = formatMermaid(stats, graph);
  } else {
    output = formatText(stats, queue);
  }

  console.log(output);
}

// Export for testing
module.exports = {
  loadGraph,
  loadQueue,
  calculateStats,
  formatText,
  formatJSON,
  formatMermaid,
};

// Run as script
const wrappedMain = wrapCLITool(main, 'integration-health-dashboard');

if (require.main === module) {
  wrappedMain();
}
