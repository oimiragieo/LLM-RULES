import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'agent-config.json');

function loadConfiguredAgentNames() {
  const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const names = new Set(Object.keys(parsed.agents || {}));

  // Router is a routing-table target but not a spawned agent file.
  names.add('router');

  return Object.freeze([...names].sort());
}

const AGENT_NAMES = loadConfiguredAgentNames();

export const ROUTING_TABLE_AGENT_NAMES = AGENT_NAMES;
export const INTENT_TO_AGENT_NAMES = AGENT_NAMES;
