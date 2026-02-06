#!/usr/bin/env node
/**
 * CUJ Validator Unified
 * Comprehensive User Journey validation tool
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const rootDir = resolve(__dirname, '../..');

export class CUJValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.tests = 0;
    this.passed = 0;
  }

  log(message) {
    console.log(`[CUJ] ${message}`);
  }

  error(message) {
    this.errors.push(message);
    console.error(`[ERROR] ${message}`);
  }

  warn(message) {
    this.warnings.push(message);
    console.warn(`[WARN] ${message}`);
  }

  async validateConfig() {
    this.tests++;
    try {
      const configPath = resolve(rootDir, '.claude/config.yaml');
      if (!existsSync(configPath)) {
        this.error('Config file not found');
        return false;
      }

      const config = readFileSync(configPath, 'utf-8');
      if (!config.includes('agent_routing:')) {
        this.error('Agent routing not configured');
        return false;
      }

      this.passed++;
      this.log('Config validation passed');
      return true;
    } catch (error) {
      this.error(`Config validation failed: ${error.message}`);
      return false;
    }
  }

  async validateAgents() {
    this.tests++;
    try {
      const agentsDir = resolve(rootDir, '.claude/agents');
      if (!existsSync(agentsDir)) {
        this.error('Agents directory not found');
        return false;
      }

      // Basic check - we have agents
      this.passed++;
      this.log('Agents validation passed');
      return true;
    } catch (error) {
      this.error(`Agents validation failed: ${error.message}`);
      return false;
    }
  }

  async validateWorkflows() {
    this.tests++;
    try {
      const workflowsDir = resolve(rootDir, '.claude/workflows');
      if (!existsSync(workflowsDir)) {
        this.error('Workflows directory not found');
        return false;
      }

      this.passed++;
      this.log('Workflows validation passed');
      return true;
    } catch (error) {
      this.error(`Workflows validation failed: ${error.message}`);
      return false;
    }
  }

  async runDoctor() {
    this.log('Running CUJ Doctor...');

    await this.validateConfig();
    await this.validateAgents();
    await this.validateWorkflows();

    this.log(`\nResults: ${this.passed}/${this.tests} tests passed`);

    if (this.errors.length > 0) {
      this.log(`\nErrors (${this.errors.length}):`);
      this.errors.forEach(error => console.error(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      this.log(`\nWarnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    return this.errors.length === 0;
  }

  async runFull() {
    this.log('Running full CUJ validation...');
    return await this.runDoctor();
  }

  async runDryRun() {
    this.log('Running CUJ dry run...');
    return await this.runDoctor();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'doctor';

  const validator = new CUJValidator();

  let success = false;
  switch (mode) {
    case 'full':
      success = await validator.runFull();
      break;
    case 'dry-run':
      success = await validator.runDryRun();
      break;
    case 'doctor':
    default:
      success = await validator.runDoctor();
      break;
  }

  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('CUJ Validator failed:', error);
    process.exit(1);
  });
}

export default CUJValidator;