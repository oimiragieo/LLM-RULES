#!/usr/bin/env node
/**
 * Services Registry
 * =================
 *
 * Parses and validates services.yaml. Provides command resolution,
 * service discovery, port conflict detection, and binary validation.
 *
 * Canonical command keys: install, test, lint, build, validate, typecheck, benchmark
 * Plus optional extra commands.
 *
 * @module services-registry
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

const { commandExists } = require('../utils/command-exists.cjs');

// Canonical command keys that are recognized
const CANONICAL_COMMANDS = [
  'install',
  'test',
  'lint',
  'build',
  'validate',
  'typecheck',
  'benchmark',
];

// JSON Schema for services.yaml validation
const SERVICES_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'object',
      additionalProperties: {
        oneOf: [
          { type: 'string', minLength: 1 },
          {
            type: 'object',
            properties: {
              default: { type: 'string', minLength: 1 },
            },
            additionalProperties: {
              type: 'string',
              minLength: 1,
            },
            required: ['default'],
          },
        ],
      },
    },
    services: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          start: { type: 'string', minLength: 1 },
          stop: { type: 'string' },
          healthcheck: { type: 'string' },
          port: { type: 'integer', minimum: 1, maximum: 65535 },
          depends_on: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['start', 'port'],
        additionalProperties: false,
      },
    },
  },
  required: [],
  additionalProperties: false,
};

/**
 * ServicesRegistry class for parsing and validating services.yaml
 */
class ServicesRegistry {
  /**
   * Create a new ServicesRegistry instance
   * @param {string} yamlPath - Path to the services.yaml file
   */
  constructor(yamlPath) {
    this.yamlPath = yamlPath;
    this.data = null;
    this.commands = {};
    this.services = {};
    this.exists = false;
    this.valid = undefined;
    this.errors = [];
  }

  /**
   * Load and parse the services.yaml file
   * @returns {{exists: boolean, valid: boolean|undefined, commands: Object, services: Object, errors: Array|null}}
   */
  load() {
    // Check if file exists
    if (!fs.existsSync(this.yamlPath)) {
      this.exists = false;
      this.valid = undefined;
      this.commands = {};
      this.services = {};
      this.errors = null;
      return {
        exists: false,
        valid: undefined,
        commands: {},
        services: {},
        errors: null,
      };
    }

    this.exists = true;

    // Read file content
    let content;
    try {
      content = fs.readFileSync(this.yamlPath, 'utf8');
    } catch (err) {
      this.valid = false;
      this.errors = [`Failed to read file: ${err.message}`];
      return {
        exists: true,
        valid: false,
        commands: {},
        services: {},
        errors: this.errors,
      };
    }

    // Empty or whitespace-only content is valid (treated as empty object)
    if (!content || content.trim() === '') {
      this.valid = true;
      this.commands = {};
      this.services = {};
      this.errors = [];
      return {
        exists: true,
        valid: true,
        commands: {},
        services: {},
        errors: [],
      };
    }

    // Parse YAML
    let parsed;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      this.valid = false;
      this.errors = [`YAML parse error: ${err.message}`];
      return {
        exists: true,
        valid: false,
        commands: {},
        services: {},
        errors: this.errors,
      };
    }

    // Handle null/undefined parsed result
    if (parsed === null || parsed === undefined) {
      this.valid = true;
      this.commands = {};
      this.services = {};
      this.errors = [];
      return {
        exists: true,
        valid: true,
        commands: {},
        services: {},
        errors: [],
      };
    }

    // Validate schema using AJV
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(SERVICES_SCHEMA);

    const isValid = validate(parsed);

    if (!isValid) {
      this.valid = false;
      this.errors = validate.errors
        ? validate.errors.map(e => {
            const path = e.instancePath || '/';
            return `Schema validation error at ${path}: ${e.message}`;
          })
        : ['Unknown schema validation error'];
      return {
        exists: true,
        valid: false,
        commands: {},
        services: {},
        errors: this.errors,
      };
    }

    // Additional validation for services (ensure start and port are present)
    const serviceErrors = [];
    if (parsed.services && typeof parsed.services === 'object') {
      for (const [name, service] of Object.entries(parsed.services)) {
        if (!service.start) {
          serviceErrors.push(`Service "${name}" is missing required field: start`);
        }
        if (service.port === undefined || service.port === null) {
          serviceErrors.push(`Service "${name}" is missing required field: port`);
        }
      }
    }

    if (serviceErrors.length > 0) {
      this.valid = false;
      this.errors = serviceErrors;
      return {
        exists: true,
        valid: false,
        commands: parsed.commands || {},
        services: parsed.services || {},
        errors: this.errors,
      };
    }

    // Store validated data
    this.valid = true;
    this.commands = parsed.commands || {};
    this.services = parsed.services || {};
    this.errors = [];

    return {
      exists: true,
      valid: true,
      commands: this.commands,
      services: this.services,
      errors: [],
    };
  }

  /**
   * Resolve a command name to its actual command string
   * @param {string} name - Command name to resolve
   * @param {Object} [options] - Resolution options
   * @param {string} [options.language] - Language-specific override (e.g., 'python', 'rust')
   * @returns {string|undefined} - The resolved command string or undefined
   */
  resolveCommand(name, options = {}) {
    if (!this.exists || !this.valid) {
      return undefined;
    }

    const commandDef = this.commands[name];
    if (!commandDef) {
      return undefined;
    }

    // If command is a string, return it directly
    if (typeof commandDef === 'string') {
      return commandDef;
    }

    // If command is an object with language overrides
    if (typeof commandDef === 'object' && commandDef !== null) {
      const { language } = options;

      // Try language-specific override first
      if (language && commandDef[language]) {
        return commandDef[language];
      }

      // Fall back to default
      return commandDef.default;
    }

    return undefined;
  }

  /**
   * Detect port conflicts between services
   * @returns {Array<{port: number, services: string[]}>} - Array of port conflicts
   */
  detectConflicts() {
    if (!this.exists || !this.valid) {
      return [];
    }

    const portMap = new Map();

    for (const [name, service] of Object.entries(this.services)) {
      const port = service.port;
      if (port !== undefined && port !== null) {
        if (!portMap.has(port)) {
          portMap.set(port, []);
        }
        portMap.get(port).push(name);
      }
    }

    const conflicts = [];
    for (const [port, services] of portMap.entries()) {
      if (services.length > 1) {
        conflicts.push({
          port,
          services,
        });
      }
    }

    return conflicts;
  }

  /**
   * Validate binaries in a compound command
   * Splits command on &&, ||, and ; and validates each binary exists
   * @param {string} commandName - Name of the command to validate
   * @returns {Array<{binary: string, exists: boolean, resolved?: string}>}
   */
  validateCommandBinaries(commandName) {
    if (!this.exists || !this.valid) {
      return [];
    }

    const commandStr = this.resolveCommand(commandName);
    if (!commandStr) {
      return [];
    }

    // Split compound commands on && || ;
    // Use a regex that splits on any of these operators with optional surrounding whitespace
    const parts = commandStr
      .split(/\s*(?:&&|\|\||;)\s*/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const results = [];

    for (const part of parts) {
      // Extract the first binary/command from the part
      // Handle shell built-ins and complex commands gracefully
      const binary = this._extractBinary(part);

      if (binary) {
        results.push({
          binary,
          exists: commandExists(binary),
          resolved: binary,
        });
      }
    }

    return results;
  }

  /**
   * Extract the main binary/ command from a command string
   * @param {string} commandPart - A single command part (not compound)
   * @returns {string|null} - The binary name or null
   * @private
   */
  _extractBinary(commandPart) {
    if (!commandPart || typeof commandPart !== 'string') {
      return null;
    }

    // Trim and get the first token
    const trimmed = commandPart.trim();
    if (!trimmed) {
      return null;
    }

    // Handle commands with arguments
    const tokens = trimmed.split(/\s+/);
    const firstToken = tokens[0];

    // Skip empty tokens
    if (!firstToken) {
      return null;
    }

    // Handle path-like binaries (extract just the name)
    const binaryName = path.basename(firstToken);

    // Validate it looks like a valid binary name (alphanumeric, dash, underscore, dot)
    if (/^[a-zA-Z0-9_.-]+$/.test(binaryName)) {
      return binaryName;
    }

    // For complex cases (like node -e "code"), just return the binary
    if (/^[a-zA-Z0-9_.-]+$/.test(firstToken)) {
      return firstToken;
    }

    return null;
  }

  /**
   * Get all services
   * @returns {Object} - Services object
   */
  getServices() {
    return this.services;
  }

  /**
   * Get all commands
   * @returns {Object} - Commands object
   */
  getCommands() {
    return this.commands;
  }

  /**
   * Check if a service exists
   * @param {string} name - Service name
   * @returns {boolean}
   */
  hasService(name) {
    return name in this.services;
  }

  /**
   * Get a specific service definition
   * @param {string} name - Service name
   * @returns {Object|undefined}
   */
  getService(name) {
    return this.services[name];
  }

  /**
   * Check if a command exists
   * @param {string} name - Command name
   * @returns {boolean}
   */
  hasCommand(name) {
    return name in this.commands;
  }
}

module.exports = {
  ServicesRegistry,
  CANONICAL_COMMANDS,
  SERVICES_SCHEMA,
};
