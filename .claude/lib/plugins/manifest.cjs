'use strict';

/**
 * Plugin Manifest Schema and Validation
 *
 * Defines the AJV JSON schema for plugin manifests (plugin.json),
 * provides validation utilities, and handles loading plugin manifests
 * from a plugin directory.
 *
 * A valid plugin.json must contain:
 * - name: string (required)
 * - description: string (required)
 * - version: string (required)
 * - author: { name: string, email?: string } (required)
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true });

/**
 * AJV JSON schema for a plugin manifest.
 * Enforces name, description, version, and author fields.
 */
const PLUGIN_MANIFEST_SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'version', 'author'],
  additionalProperties: true,
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    version: { type: 'string' },
    author: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string' },
      },
    },
  },
};

/**
 * Expected subdirectory structure within a plugin directory.
 */
const PLUGIN_STRUCTURE = {
  subdirs: ['skills', 'hooks', 'droids', 'commands'],
};

const _compiledValidate = ajv.compile(PLUGIN_MANIFEST_SCHEMA);

/**
 * Validates a manifest object against the plugin manifest schema.
 *
 * @param {object} manifestObj - The manifest object to validate
 * @returns {{ valid: boolean, errors: Array|null }} Validation result
 */
function validateManifest(manifestObj) {
  const valid = _compiledValidate(manifestObj);
  return {
    valid,
    errors: valid ? null : _compiledValidate.errors ? [..._compiledValidate.errors] : [],
  };
}

/**
 * Loads and validates a plugin manifest from a plugin directory.
 * Reads `.factory-plugin/plugin.json` within the given directory.
 *
 * @param {string} pluginDir - Path to the plugin root directory
 * @returns {{ valid: boolean, errors: Array|null, manifest: object|null }}
 */
function loadManifest(pluginDir) {
  const pluginJsonPath = path.join(pluginDir, '.factory-plugin', 'plugin.json');

  let content;
  try {
    content = fs.readFileSync(pluginJsonPath, 'utf8');
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: `Failed to read plugin.json: ${err.message}` }],
      manifest: null,
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: `Failed to parse plugin.json: ${err.message}` }],
      manifest: null,
    };
  }

  const { valid, errors } = validateManifest(manifest);
  return {
    valid,
    errors: valid ? null : errors,
    manifest: valid ? manifest : null,
  };
}

module.exports = {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_STRUCTURE,
  validateManifest,
  loadManifest,
};
