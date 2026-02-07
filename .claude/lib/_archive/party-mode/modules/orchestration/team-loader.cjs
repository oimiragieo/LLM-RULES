/**
 * Team Loader
 *
 * Loads and validates team definitions from CSV files.
 * Teams define collections of agents with roles, priorities, tools, and models.
 *
 * CSV Format:
 * agent_type,role,priority,tools,model
 * developer,implementer,1,"Read,Write,Edit",sonnet
 *
 * Validation Rules:
 * - Max 4 agents per team
 * - Valid roles: implementer, reviewer, validator, coordinator
 * - Valid models: haiku, sonnet, opus
 * - Required fields: agent_type, role, priority, tools, model
 */

const fs = require('fs/promises');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const TEAMS_DIR = path.join(PROJECT_ROOT, '.claude', 'teams');

// Valid agent roles
const VALID_ROLES = ['implementer', 'reviewer', 'validator', 'coordinator'];

// Valid LLM models
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

/**
 * Load team definition from CSV file
 *
 * @param {string} teamName - Team name (filename without .csv extension)
 * @returns {Promise<Object>} Team definition
 * @returns {string} team.teamName - Team name
 * @returns {Array<Object>} team.agents - Array of agent definitions
 * @throws {Error} If team file not found or parsing fails
 */
async function loadTeam(teamName) {
  const teamPath = path.join(TEAMS_DIR, `${teamName}.csv`);

  // Check if team file exists
  try {
    await fs.access(teamPath);
  } catch (_err) {
    throw new Error(`Team "${teamName}" not found at ${teamPath}`);
  }

  // Read CSV file
  const csvContent = await fs.readFile(teamPath, 'utf-8');

  // Parse CSV (simple parsing - split by lines and commas)
  const lines = csvContent.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim());

  // Validate header
  const requiredFields = ['agent_type', 'role', 'priority', 'tools', 'model'];
  const missingFields = requiredFields.filter(field => !header.includes(field));
  if (missingFields.length > 0) {
    throw new Error(`Team CSV missing required fields: ${missingFields.join(', ')}`);
  }

  // Parse agent rows
  const agents = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Split by comma, handling quoted strings
    const values = parseCSVLine(line);

    // Create agent object
    const agent = {};
    for (let j = 0; j < header.length; j++) {
      const field = header[j];
      const value = values[j];

      if (field === 'priority') {
        agent[field] = parseInt(value, 10);
      } else if (field === 'tools') {
        // Parse tools string "Read,Write,Edit" -> ['Read', 'Write', 'Edit']
        agent[field] = value.split(',').map(t => t.trim());
      } else {
        agent[field] = value;
      }
    }

    agents.push(agent);
  }

  return {
    teamName,
    agents,
  };
}

/**
 * Parse CSV line handling quoted strings
 *
 * Simple CSV parser that handles commas inside quotes.
 * Example: 'developer,implementer,"Read,Write,Edit",sonnet'
 *
 * @param {string} line - CSV line
 * @returns {Array<string>} Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Push last value
  values.push(current.trim());

  return values;
}

/**
 * Validate team definition
 *
 * Checks team structure, agent count, roles, models, and required fields.
 *
 * @param {Object} team - Team definition
 * @param {string} team.teamName - Team name
 * @param {Array<Object>} team.agents - Array of agent definitions
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether team is valid
 * @returns {Array<string>} result.errors - Array of validation errors
 */
function validateTeamDefinition(team) {
  const errors = [];

  // Check 1: Team has teamName
  if (!team.teamName) {
    errors.push('Team missing required field: teamName');
  }

  // Check 2: Team has agents array
  if (!team.agents || !Array.isArray(team.agents)) {
    errors.push('Team missing required field: agents (must be array)');
    return { valid: false, errors }; // Can't continue without agents
  }

  // Check 3: Max 4 agents
  if (team.agents.length > 4) {
    errors.push(`Team has ${team.agents.length} agents (max 4 agents allowed)`);
  }

  // Check 4: At least 1 agent
  if (team.agents.length === 0) {
    errors.push('Team must have at least 1 agent');
  }

  // Check 5: Validate each agent
  team.agents.forEach((agent, index) => {
    // Required fields
    const requiredFields = ['agent_type', 'role', 'priority', 'tools', 'model'];
    const missingFields = requiredFields.filter(field => agent[field] === undefined);
    if (missingFields.length > 0) {
      errors.push(`Agent ${index + 1} missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate role
    if (agent.role && !VALID_ROLES.includes(agent.role)) {
      errors.push(
        `Agent ${index + 1} has invalid role: ${agent.role} (valid: ${VALID_ROLES.join(', ')})`
      );
    }

    // Validate model
    if (agent.model && !VALID_MODELS.includes(agent.model)) {
      errors.push(
        `Agent ${index + 1} has invalid model: ${agent.model} (valid: ${VALID_MODELS.join(', ')})`
      );
    }

    // Validate tools array
    if (agent.tools && !Array.isArray(agent.tools)) {
      errors.push(`Agent ${index + 1} tools must be array`);
    }

    // Validate priority is number
    if (agent.priority && typeof agent.priority !== 'number') {
      errors.push(`Agent ${index + 1} priority must be number`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get list of all available teams
 *
 * Scans .claude/teams directory for .csv files.
 *
 * @returns {Promise<Array<string>>} Array of team names (without .csv extension)
 */
async function getTeamList() {
  try {
    const files = await fs.readdir(TEAMS_DIR);

    // Filter for .csv files and remove extension
    const teams = files.filter(file => file.endsWith('.csv')).map(file => file.replace('.csv', ''));

    return teams;
  } catch (_err) {
    // Directory doesn't exist or can't be read
    return [];
  }
}

module.exports = {
  loadTeam,
  validateTeamDefinition,
  getTeamList,
};
