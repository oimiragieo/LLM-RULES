#!/usr/bin/env node
/**
 * Agent Parser with Identity Validation
 * ======================================
 *
 * Parses agent YAML frontmatter and validates identity fields against JSON Schema.
 * Task #46 (P1-7.2): Update agent definition schema
 *
 * Usage:
 *   const { AgentParser } = require('./agent-parser.cjs');
 *   const parser = new AgentParser();
 *   const result = parser.parseAgentFile('/path/to/agent.md');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { validateData } = require('../utils/schema-validator.cjs');

// =============================================================================
// Agent Parser Class
// =============================================================================

class AgentParser {
  constructor() {
    // Load JSON Schema for agent identity
    const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-identity.schema.json');
    this.identitySchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    // Initialize AJV validator
    this.ajv = new Ajv({
      allErrors: true, // Collect all errors
      verbose: true, // Include schema and data in errors
      strict: false, // Allow non-standard keywords like "version"
    });
    this.validateIdentityFn = this.ajv.compile(this.identitySchema);
  }

  /**
   * Parse agent file and validate identity if present
   *
   * @param {string} filePath - Path to agent markdown file
   * @returns {Object} Parsed agent definition with identity (if present)
   * @throws {Error} If identity validation fails
   */
  parseAgentFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      throw new Error(`No YAML frontmatter found in ${filePath}`);
    }

    const frontmatter = yaml.load(frontmatterMatch[1]);

    // Validate identity if present
    if (frontmatter.identity) {
      const validation = this.validateIdentity(frontmatter.identity);
      if (!validation.valid) {
        const errorMessages = validation.errors.map(err => err.message).join(', ');
        throw new Error(`Identity validation failed: ${errorMessages}`);
      }
    }

    return frontmatter;
  }

  /**
   * Validate identity object against JSON Schema
   *
   * @param {Object} identity - Identity object to validate
   * @returns {{ valid: boolean, errors?: Array<{path: string, message: string}> }}
   */
  validateIdentity(identity) {
    const valid = this.validateIdentityFn(identity);

    if (valid) {
      return { valid: true };
    }

    // Format validation errors
    const errors = this.validateIdentityFn.errors.map(err => {
      let message = err.message;

      // Add more context to common errors
      if (err.keyword === 'minLength') {
        message = `${err.instancePath || 'field'} ${err.message}`;
      } else if (err.keyword === 'enum') {
        message = `${err.instancePath} should be equal to one of the allowed values`;
      } else if (err.keyword === 'required') {
        message = `Missing required field: ${err.params.missingProperty}`;
      }

      return {
        path: err.instancePath || err.schemaPath,
        message: message,
      };
    });

    return { valid: false, errors };
  }

  /**
   * Validate a full agent definition (frontmatter + content) against
   * agent-definition.schema.json using Ajv.
   * Advisory only -- returns validation result but does not throw.
   * Graceful degradation if schema is unavailable.
   *
   * @param {Object|null} definition - Agent definition object { frontmatter, content }
   * @returns {{ valid: boolean, errors: Array|null, skipped?: boolean }}
   */
  validateDefinition(definition) {
    const schemaPath = path.join(
      PROJECT_ROOT, '.claude', 'schemas', 'agent-definition.schema.json'
    );
    return validateData(definition, schemaPath);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = { AgentParser };
