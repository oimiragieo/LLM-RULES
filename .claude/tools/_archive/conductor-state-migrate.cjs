#!/usr/bin/env node
/**
 * SPEC-015: Conductor State Migration Tool
 * Migrates legacy `setup_state.json` to new `workflow-state.json` schema.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    input: '',
    output: '',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      parsed.input = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      parsed.output = args[++i];
    } else if (args[i] === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  return parsed;
}

function migrateState(legacyState) {
  const newState = {
    workflowId: legacyState.project_name || 'migrated-workflow',
    status: 'active',
    currentPhase: legacyState.current_step || 'unknown',
    phases: {},
    context: {
      migratedAt: new Date().toISOString(),
      legacyData: legacyState.metadata || {},
    },
    history: [],
  };

  // simplistic mapping of phases
  // assuming legacy has a simple list of phases or inferred from context
  // If legacy doesn't list all phases, we create a generic structure

  if (legacyState.phases && Array.isArray(legacyState.phases)) {
    legacyState.phases.forEach(p => {
      newState.phases[p.name] = {
        name: p.name,
        status: p.status || 'pending',
        tasks: [],
      };
    });
  } else {
    // Fallback: Create phases based on completed_phases
    if (legacyState.completed_phases) {
      legacyState.completed_phases.forEach(p => {
        newState.phases[p] = { name: p, status: 'completed', tasks: [] };
      });
    }

    // Add current phase
    if (legacyState.current_step && !newState.phases[legacyState.current_step]) {
      newState.phases[legacyState.current_step] = {
        name: legacyState.current_step,
        status: 'active',
        tasks: [],
      };
    }
  }

  return newState;
}

function main() {
  const { input, output, dryRun } = parseArgs();

  if (!input) {
    console.error('Error: --input <path> is required');
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(input, 'utf8');
    const legacy = JSON.parse(raw);
    const migrated = migrateState(legacy);

    if (dryRun) {
      console.log(JSON.stringify(migrated, null, 2));
    } else {
      if (output) {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(migrated, null, 2));
        console.log(`Successfully migrated state to ${output}`);
      } else {
        console.log(JSON.stringify(migrated, null, 2));
      }
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { migrateState };
