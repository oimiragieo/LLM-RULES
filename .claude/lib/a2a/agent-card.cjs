#!/usr/bin/env node
'use strict';

/**
 * Agent Card Generator
 * ====================
 * Generates an A2A-compatible Agent Card from the agent registry and
 * mounts it on an Express router at GET /.well-known/agent.json.
 *
 * A2A spec: https://google.github.io/A2A/#/documentation
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'context', 'agent-registry.json');

/**
 * Load the agent registry from disk.
 * Returns an empty agents object on any error.
 * @returns {{ agents: Record<string, object> }}
 */
function loadRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    // safeParseJSON returns the parsed object directly (or defaults on error),
    // NOT a {success, data} envelope. Treat the return value as the data.
    const data = safeParseJSON(raw, null);
    if (!data || typeof data.agents !== 'object') return { agents: {} };
    return data;
  } catch {
    return { agents: {} };
  }
}

/**
 * Build an A2A Agent Card object.
 * @param {string} [baseUrl='http://localhost:3100'] - Base URL of this server
 * @returns {object} Agent Card
 */
function generateAgentCard(baseUrl = 'http://localhost:3100') {
  const registry = loadRegistry();

  const skills = Object.entries(registry.agents || {}).map(([id, agent]) => ({
    id,
    name: agent.name || id,
    description: agent.description || '',
  }));

  return {
    name: 'Agent Studio',
    description: 'Multi-agent AI framework',
    url: baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills,
  };
}

/**
 * Create an Express router that serves GET /.well-known/agent.json.
 * @param {string} [baseUrl] - Passed to generateAgentCard
 * @returns {import('express').Router}
 */
function getAgentCardRouter(baseUrl) {
  // Express is loaded lazily so the module can be required without express
  // being present at load time in test environments that don't need the router.
  const { Router } = require('express');
  const router = Router();

  router.get('/.well-known/agent.json', (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3100';
    const derivedBase = baseUrl || `${protocol}://${host}`;
    res.json(generateAgentCard(derivedBase));
  });

  return router;
}

module.exports = { generateAgentCard, getAgentCardRouter, loadRegistry };
