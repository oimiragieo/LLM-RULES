#!/usr/bin/env node
/**
 * MCP Tool Resolver - Correctly Resolves MCP Tool Availability
 *
 * Reads .mcp.json configuration and properly determines which MCP tools are available.
 * Fixes the bug where tool-manifest.json incorrectly marks MCP tools as unavailable.
 *
 * @module mcp-tool-resolver
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const MCP_CONFIG_PATH = path.join(PROJECT_ROOT, '.mcp.json');
const TOOL_MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude/config/tool-manifest.json');

/**
 * Load MCP configuration from .mcp.json
 * @returns {Object} MCP configuration
 */
function loadMcpConfig() {
  try {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      return { mcpServers: {} };
    }
    const content = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[mcp-resolver] Error loading MCP config:', err.message);
    return { mcpServers: {} };
  }
}

/**
 * Check if an MCP server is configured
 * @param {string} serverName - Name of the MCP server
 * @returns {boolean}
 */
function isMcpServerConfigured(serverName) {
  const config = loadMcpConfig();
  return config.mcpServers && !!config.mcpServers[serverName];
}

/**
 * Get list of configured MCP servers
 * @returns {string[]}
 */
function getConfiguredMcpServers() {
  const config = loadMcpConfig();
  return Object.keys(config.mcpServers || {});
}

/**
 * Resolve MCP tool status
 * @param {string} toolName - Full tool name (e.g., "mcp__sequential-thinking__sequentialthinking")
 * @returns {{available: boolean, serverName: string|null, toolName: string|null, reason: string|null}}
 */
function resolveMcpToolStatus(toolName) {
  if (!toolName || !toolName.startsWith('mcp__')) {
    return { available: false, serverName: null, toolName: null, reason: 'Not an MCP tool' };
  }

  // Parse tool name: mcp__<server>__<tool>
  const parts = toolName.split('__');
  if (parts.length < 3) {
    return {
      available: false,
      serverName: null,
      toolName: null,
      reason: 'Invalid MCP tool name format',
    };
  }

  const serverName = parts[1];
  const actualToolName = parts.slice(2).join('__');

  const isConfigured = isMcpServerConfigured(serverName);

  return {
    available: isConfigured,
    serverName,
    toolName: actualToolName,
    reason: isConfigured ? null : `MCP server '${serverName}' not configured in .mcp.json`,
  };
}

/**
 * Update tool manifest with correct MCP tool availability
 * This fixes the manifest to reflect actual .mcp.json configuration
 */
function updateToolManifestMcpStatus() {
  try {
    if (!fs.existsSync(TOOL_MANIFEST_PATH)) {
      console.error('[mcp-resolver] Tool manifest not found:', TOOL_MANIFEST_PATH);
      return false;
    }

    const manifest = JSON.parse(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf-8'));
    const config = loadMcpConfig();
    const configuredServers = Object.keys(config.mcpServers || {});

    let updated = false;

    // Update MCP tools in manifest
    if (manifest.tools && manifest.tools.mcp) {
      for (const tool of manifest.tools.mcp) {
        if (!tool.mcp_server) continue;

        const isConfigured = configuredServers.includes(tool.mcp_server);
        const wasAvailable = tool.status === 'available';

        if (isConfigured !== wasAvailable) {
          tool.status = isConfigured ? 'available' : 'unavailable';
          tool.reason = isConfigured
            ? `MCP server '${tool.mcp_server}' is configured`
            : `MCP server '${tool.mcp_server}' not configured in .mcp.json`;
          updated = true;
        }
      }
    }

    if (updated) {
      manifest.metadata.lastValidated = new Date().toISOString();
      fs.writeFileSync(TOOL_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log('[mcp-resolver] Updated tool manifest MCP status');
    } else {
      console.log('[mcp-resolver] Tool manifest MCP status is correct');
    }

    return true;
  } catch (err) {
    console.error('[mcp-resolver] Error updating tool manifest:', err.message);
    return false;
  }
}

/**
 * Get available MCP tools with their fallbacks
 * @returns {Array<Object>}
 */
function getAvailableMcpTools() {
  try {
    const manifest = JSON.parse(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf-8'));
    const config = loadMcpConfig();
    const configuredServers = Object.keys(config.mcpServers || {});

    return (manifest.tools?.mcp || []).filter(tool => configuredServers.includes(tool.mcp_server));
  } catch (err) {
    console.error('[mcp-resolver] Error getting available MCP tools:', err.message);
    return [];
  }
}

/**
 * Get fallback for an MCP tool when server is unavailable
 * @param {string} toolName - MCP tool name
 * @returns {string|null} Fallback description or null
 */
function getMcpToolFallback(toolName) {
  try {
    const manifest = JSON.parse(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf-8'));
    const tool = (manifest.tools?.mcp || []).find(t => t.name === toolName);
    return tool?.fallback || null;
  } catch (_err) {
    return null;
  }
}

// Export functions
module.exports = {
  loadMcpConfig,
  isMcpServerConfigured,
  getConfiguredMcpServers,
  resolveMcpToolStatus,
  updateToolManifestMcpStatus,
  getAvailableMcpTools,
  getMcpToolFallback,
  MCP_CONFIG_PATH,
  TOOL_MANIFEST_PATH,
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--update-manifest')) {
    const success = updateToolManifestMcpStatus();
    process.exit(success ? 0 : 1);
  }

  if (args.includes('--list-servers')) {
    const servers = getConfiguredMcpServers();
    console.log('\nConfigured MCP Servers:');
    servers.forEach(s => console.log(`  - ${s}`));
    process.exit(0);
  }

  if (args.includes('--check-tool') && args[args.indexOf('--check-tool') + 1]) {
    const toolName = args[args.indexOf('--check-tool') + 1];
    const status = resolveMcpToolStatus(toolName);
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  console.log('Usage: node mcp-tool-resolver.cjs [options]');
  console.log('  --update-manifest     Update tool-manifest.json with correct MCP status');
  console.log('  --list-servers        List configured MCP servers');
  console.log('  --check-tool <name>   Check status of specific MCP tool');
  process.exit(1);
}
