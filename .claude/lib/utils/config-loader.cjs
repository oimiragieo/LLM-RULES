/**
 * Configuration Loader
 *
 * Loads environment-specific configuration files.
 * Falls back to default config.yaml if environment-specific config doesn't exist.
 *
 * @module config-loader
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getEnvironment } = require('./environment.cjs');

let cachedConfig = null;

/**
 * Get project root directory
 * @returns {string} Absolute path to project root
 */
function getProjectRoot() {
  // We're in .claude/lib/utils, so walk up 3 levels to get to project root
  // __dirname = PROJECT_ROOT/.claude/lib/utils
  // path.dirname(__dirname) = PROJECT_ROOT/.claude/lib
  // path.dirname(path.dirname(__dirname)) = PROJECT_ROOT/.claude
  // path.dirname(path.dirname(path.dirname(__dirname))) = PROJECT_ROOT

  const projectRoot = path.dirname(path.dirname(path.dirname(__dirname)));

  // Verify .claude directory exists
  const claudeDir = path.join(projectRoot, '.claude');
  if (!fs.existsSync(claudeDir)) {
    throw new Error(`Could not find .claude directory in ${projectRoot}`);
  }

  return projectRoot;
}

/**
 * Load configuration file for current environment
 *
 * @param {boolean} [useCache=true] - Use cached config if available
 * @returns {Object} Parsed configuration object
 * @throws {Error} If config file not found or invalid
 */
function loadConfig(useCache = true) {
  if (useCache && cachedConfig) {
    return cachedConfig;
  }

  const env = getEnvironment();
  const projectRoot = getProjectRoot();

  // Determine config file path
  let configFile;
  let configPath;

  if (env === 'staging') {
    configFile = 'config.staging.yaml';
    configPath = path.join(projectRoot, '.claude', configFile);

    // Fall back to default if staging config doesn't exist
    if (!fs.existsSync(configPath)) {
      console.warn(
        `[config-loader] Staging config not found at ${configPath}, using default config.yaml`
      );
      configFile = 'config.yaml';
      configPath = path.join(projectRoot, '.claude', configFile);
    }
  } else {
    // Development and production use default config.yaml
    configFile = 'config.yaml';
    configPath = path.join(projectRoot, '.claude', configFile);
  }

  // Load and parse config
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    // SEC-LIB-003 FIX: Use safe YAML schema to prevent deserialization attacks
    const config = yaml.load(configContent, { schema: yaml.CORE_SCHEMA });

    // Add metadata
    config._meta = {
      environment: env,
      configFile: configFile,
      configPath: configPath,
      loadedAt: new Date().toISOString(),
    };

    cachedConfig = config;
    return config;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}

/**
 * Clear cached configuration (force reload on next call)
 */
function clearCache() {
  cachedConfig = null;
}

/**
 * Get environment-specific path
 *
 * Staging uses .claude/staging/* paths, development/production use .claude/* paths
 *
 * @param {string} relativePath - Path relative to .claude directory
 * @returns {string} Absolute path adjusted for environment
 */
function getEnvironmentPath(relativePath) {
  const env = getEnvironment();
  const projectRoot = getProjectRoot();

  if (env === 'staging') {
    // Staging: .claude/staging/<relativePath>
    return path.join(projectRoot, '.claude', 'staging', relativePath);
  }

  // Development/Production: .claude/<relativePath>
  return path.join(projectRoot, '.claude', relativePath);
}

module.exports = {
  loadConfig,
  clearCache,
  getEnvironmentPath,
  getProjectRoot,
};
