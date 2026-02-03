#!/usr/bin/env node
/**
 * System Registration Handler
 * ===========================
 *
 * Automates registration of artifacts in system files.
 * Part of the EVOLVE workflow integration layer.
 *
 * Handles registration in:
 * - CLAUDE.md (agents, skills, workflows)
 * - settings.json (hooks)
 * - skill-catalog.md (skills)
 * - routing-table.cjs (agent keywords)
 *
 * Features:
 * - Create backups before modification
 * - Register/deregister artifacts
 * - Update existing registrations
 * - Verify registration status
 *
 * Usage:
 *   const { SystemRegistrationHandler } = require('./system-registration-handler.cjs');
 *
 *   const handler = new SystemRegistrationHandler();
 *   await handler.registerAgent({ name: 'my-agent', ... });
 */

'use strict';

const fs = require('fs');
const path = require('path');
// BUG-NEW-004 FIX: Import path validation utility
const { validatePathWithinProject, PROJECT_ROOT } = require('../utils/project-root.cjs');
// BUG-NEW-001 FIX: Import safe JSON utilities for SEC-007 compliance
const { safeReadJSON } = require('../utils/safe-json.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Default paths relative to project root
 */
const DEFAULT_PATHS = {
  claudeMd: '.claude/CLAUDE.md',
  settingsJson: '.claude/settings.json',
  skillCatalog: '.claude/context/artifacts/skill-catalog.md',
  routerEnforcer: '.claude/lib/routing/routing-table.cjs',
  backups: '.claude/context/backups',
};

/**
 * Registration sections in CLAUDE.md
 */
const CLAUDE_MD_SECTIONS = {
  agents: '## 3. AGENT ROUTING TABLE',
  skills: '## 8.5 WORKFLOW ENHANCEMENT SKILLS',
  workflows: '## 8.6 ENTERPRISE WORKFLOWS',
};

// =============================================================================
// SystemRegistrationHandler Class
// =============================================================================

/**
 * Handles artifact registration in system files
 */
class SystemRegistrationHandler {
  /**
   * Create a new SystemRegistrationHandler
   *
   * @param {Object} options - Configuration options
   * @param {string} options.basePath - Base path for all files
   * @param {string} options.claudeMdPath - Path to CLAUDE.md
   * @param {string} options.settingsJsonPath - Path to settings.json
   * @param {string} options.skillCatalogPath - Path to skill-catalog.md
   * @param {string} options.routerEnforcerPath - Path to routing-table.cjs
   * @param {string} options.backupDir - Directory for backups
   * @param {boolean} options.testMode - Enable test mode
   */
  constructor(options = {}) {
    const basePath = options.basePath || process.cwd();
    const testMode = options.testMode || false;

    // BUG-NEW-004 FIX: Validate basePath to prevent path traversal
    if (!testMode && basePath !== PROJECT_ROOT) {
      const validation = validatePathWithinProject(basePath, PROJECT_ROOT);
      if (!validation.safe) {
        throw new Error(`Invalid basePath: ${validation.reason}`);
      }
    }

    this.options = {
      basePath,
      testMode,
      claudeMdPath:
        options.claudeMdPath ||
        path.join(basePath, testMode ? 'CLAUDE.md' : DEFAULT_PATHS.claudeMd),
      settingsJsonPath:
        options.settingsJsonPath ||
        path.join(basePath, testMode ? 'settings.json' : DEFAULT_PATHS.settingsJson),
      skillCatalogPath:
        options.skillCatalogPath ||
        path.join(basePath, testMode ? 'skill-catalog.md' : DEFAULT_PATHS.skillCatalog),
      routerEnforcerPath:
        options.routerEnforcerPath ||
        path.join(basePath, testMode ? 'routing-table.cjs' : DEFAULT_PATHS.routerEnforcer),
      backupDir:
        options.backupDir || path.join(basePath, testMode ? 'backups' : DEFAULT_PATHS.backups),
    };

    // BUG-NEW-004 FIX: Validate all paths if explicitly provided
    if (!testMode) {
      this._validatePaths();
    }

    // Ensure backup directory exists
    this._ensureBackupDir();
  }

  /**
   * Validate all configured paths are within project root
   * BUG-NEW-004 FIX: Prevents path traversal attacks
   * @private
   */
  _validatePaths() {
    const pathsToValidate = [
      { name: 'claudeMdPath', path: this.options.claudeMdPath },
      { name: 'settingsJsonPath', path: this.options.settingsJsonPath },
      { name: 'skillCatalogPath', path: this.options.skillCatalogPath },
      { name: 'routerEnforcerPath', path: this.options.routerEnforcerPath },
      { name: 'backupDir', path: this.options.backupDir },
    ];

    for (const { name, path: pathValue } of pathsToValidate) {
      if (pathValue) {
        const validation = validatePathWithinProject(pathValue, PROJECT_ROOT);
        if (!validation.safe) {
          throw new Error(`Invalid ${name}: ${validation.reason}`);
        }
      }
    }
  }

  /**
   * Ensure backup directory exists
   * @private
   */
  _ensureBackupDir() {
    if (!fs.existsSync(this.options.backupDir)) {
      fs.mkdirSync(this.options.backupDir, { recursive: true });
    }
  }

  /**
   * Create a backup of a file
   * @private
   */
  async _createBackup(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const backupName = `${fileName}.${timestamp}.backup`;
    const backupPath = path.join(this.options.backupDir, backupName);

    await fs.promises.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Register an agent in CLAUDE.md
   *
   * @param {Object} agentDef - Agent definition
   * @param {string} agentDef.name - Agent name
   * @param {string} agentDef.requestType - Request type description
   * @param {string} agentDef.filePath - Path to agent file
   * @param {Object} options - Registration options
   * @returns {Promise<{success: boolean, backupCreated: boolean, registrations: string[]}>}
   */
  async registerAgent(agentDef, _options = {}) {
    const { name, requestType, filePath } = agentDef;
    const registrations = [];

    // Create backup
    const backupPath = await this._createBackup(this.options.claudeMdPath);
    const backupCreated = backupPath !== null;

    try {
      // Read CLAUDE.md
      let content = fs.readFileSync(this.options.claudeMdPath, 'utf-8');

      // Find the agent routing table section
      const sectionMarker = CLAUDE_MD_SECTIONS.agents;
      const sectionIndex = content.indexOf(sectionMarker);

      if (sectionIndex === -1) {
        throw new Error('Agent routing table section not found in CLAUDE.md');
      }

      // Find the end of the table (next ## or end of file)
      const afterSection = content.substring(sectionIndex + sectionMarker.length);
      const tableEndMatch = afterSection.match(/\n\n## /);
      const tableEndIndex = tableEndMatch
        ? sectionIndex + sectionMarker.length + tableEndMatch.index
        : content.length;

      // Insert new agent row before the end of the table
      const tableContent = content.substring(sectionIndex, tableEndIndex);
      const lastRowMatch = tableContent.match(/\| [^\n]+ \|[^\n]*$/m);

      if (lastRowMatch) {
        const insertIndex = sectionIndex + lastRowMatch.index + lastRowMatch[0].length;
        const newRow = `\n| ${requestType} | \`${name}\` | \`${filePath}\` |`;
        content = content.substring(0, insertIndex) + newRow + content.substring(insertIndex);
      }

      // Write updated content
      fs.writeFileSync(this.options.claudeMdPath, content);
      registrations.push('claude-md');

      return {
        success: true,
        backupCreated,
        backupPath,
        registrations,
      };
    } catch (e) {
      // Restore from backup if available
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.claudeMdPath);
      }
      throw e;
    }
  }

  /**
   * Register a skill in skill-catalog.md and optionally CLAUDE.md
   *
   * @param {Object} skillDef - Skill definition
   * @param {string} skillDef.name - Skill name
   * @param {string} skillDef.description - Skill description
   * @param {string} skillDef.category - Skill category
   * @param {boolean} skillDef.registerInClaudeMd - Also register in CLAUDE.md
   * @param {Object} options - Registration options
   * @returns {Promise<{success: boolean, backupCreated: boolean, registrations: string[]}>}
   */
  async registerSkill(skillDef, _options = {}) {
    const { name, description, category, registerInClaudeMd = false } = skillDef;
    const registrations = [];

    // Create backup
    const backupPath = await this._createBackup(this.options.skillCatalogPath);
    const backupCreated = backupPath !== null;

    try {
      // Read skill-catalog.md
      let content = fs.readFileSync(this.options.skillCatalogPath, 'utf-8');

      // Find the appropriate category or add to end
      const categoryMarker = `## ${category}`;
      const categoryIndex = content.toLowerCase().indexOf(categoryMarker.toLowerCase());

      if (categoryIndex !== -1) {
        // Add after the category's table
        const afterCategory = content.substring(categoryIndex);
        const tableEndMatch = afterCategory.match(/\n\n(?=##|\n*$)/);
        const insertIndex = tableEndMatch ? categoryIndex + tableEndMatch.index : content.length;

        const newRow = `| ${name} | ${description} |\n`;
        content =
          content.substring(0, insertIndex) + '\n' + newRow + content.substring(insertIndex);
      } else {
        // Add at the end
        content += `\n| ${name} | ${description} |\n`;
      }

      // Write updated content
      fs.writeFileSync(this.options.skillCatalogPath, content);
      registrations.push('skill-catalog');

      // Optionally register in CLAUDE.md
      if (registerInClaudeMd) {
        const _claudeBackup = await this._createBackup(this.options.claudeMdPath);
        let claudeContent = fs.readFileSync(this.options.claudeMdPath, 'utf-8');

        const skillSectionMarker = CLAUDE_MD_SECTIONS.skills;
        const skillSectionIndex = claudeContent.indexOf(skillSectionMarker);

        if (skillSectionIndex !== -1) {
          // Find table end and insert
          const afterSection = claudeContent.substring(skillSectionIndex);
          const tableEndMatch = afterSection.match(/\n\n## /);
          const tableEndIndex = tableEndMatch
            ? skillSectionIndex + tableEndMatch.index
            : claudeContent.length;

          const skillEntry = `| \`${name}\` | ${description} |\n`;
          claudeContent =
            claudeContent.substring(0, tableEndIndex) +
            skillEntry +
            claudeContent.substring(tableEndIndex);
          fs.writeFileSync(this.options.claudeMdPath, claudeContent);
          registrations.push('claude-md');
        }
      }

      return {
        success: true,
        backupCreated,
        backupPath,
        registrations,
      };
    } catch (e) {
      // Restore from backup if available
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.skillCatalogPath);
      }
      throw e;
    }
  }

  /**
   * Register a hook in settings.json
   *
   * @param {Object} hookDef - Hook definition
   * @param {string} hookDef.name - Hook name
   * @param {string} hookDef.matcher - Event matcher (PreToolUse, PostToolUse, etc.)
   * @param {string} hookDef.toolFilter - Optional tool filter
   * @param {string} hookDef.path - Path to hook file
   * @param {Object} options - Registration options
   * @returns {Promise<{success: boolean, backupCreated: boolean, registrations: string[]}>}
   */
  async registerHook(hookDef, _options = {}) {
    const { _name, matcher, toolFilter, path: hookPath } = hookDef;
    const registrations = [];

    // Create backup
    const backupPath = await this._createBackup(this.options.settingsJsonPath);
    const backupCreated = backupPath !== null;

    try {
      // Read settings.json
      // BUG-NEW-001 FIX: Use safeReadJSON for SEC-007 compliance
      const settings = safeReadJSON(this.options.settingsJsonPath, 'settings-json');

      // Ensure hooks array exists
      if (!settings.hooks) {
        settings.hooks = [];
      }

      // Check if hook already exists
      const exists = settings.hooks.some(h => h.path === hookPath);
      if (!exists) {
        // Add new hook entry
        const hookEntry = {
          matcher,
          path: hookPath,
        };

        if (toolFilter) {
          hookEntry.toolFilter = toolFilter;
        }

        settings.hooks.push(hookEntry);

        // Write updated settings
        fs.writeFileSync(this.options.settingsJsonPath, JSON.stringify(settings, null, 2));
      }

      registrations.push('settings-json');

      return {
        success: true,
        backupCreated,
        backupPath,
        registrations,
      };
    } catch (e) {
      // Restore from backup if available
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.settingsJsonPath);
      }
      throw e;
    }
  }

  /**
   * Register a workflow in CLAUDE.md
   *
   * @param {Object} workflowDef - Workflow definition
   * @param {string} workflowDef.name - Workflow name
   * @param {string} workflowDef.path - Path to workflow file
   * @param {string} workflowDef.purpose - Workflow purpose/description
   * @param {Object} options - Registration options
   * @returns {Promise<{success: boolean, backupCreated: boolean, registrations: string[]}>}
   */
  async registerWorkflow(workflowDef, _options = {}) {
    const { name, path: workflowPath, purpose } = workflowDef;
    const registrations = [];

    // Create backup
    const backupPath = await this._createBackup(this.options.claudeMdPath);
    const backupCreated = backupPath !== null;

    try {
      // Read CLAUDE.md
      let content = fs.readFileSync(this.options.claudeMdPath, 'utf-8');

      // Find the workflows section
      const sectionMarker = CLAUDE_MD_SECTIONS.workflows;
      const sectionIndex = content.indexOf(sectionMarker);

      if (sectionIndex === -1) {
        // Section doesn't exist - add at end
        content += `\n\n${sectionMarker}\n\n| Workflow | Path | Purpose |\n|----------|------|----------|\n| **${name}** | \`${workflowPath}\` | ${purpose} |`;
      } else {
        // Find table end and insert
        const afterSection = content.substring(sectionIndex);
        const tableEndMatch = afterSection.match(/\n\n(?=## |\n*$)/);
        const tableEndIndex = tableEndMatch ? sectionIndex + tableEndMatch.index : content.length;

        const newRow = `| **${name}** | \`${workflowPath}\` | ${purpose} |\n`;
        content = content.substring(0, tableEndIndex) + newRow + content.substring(tableEndIndex);
      }

      // Write updated content
      fs.writeFileSync(this.options.claudeMdPath, content);
      registrations.push('claude-md');

      return {
        success: true,
        backupCreated,
        backupPath,
        registrations,
      };
    } catch (e) {
      // Restore from backup if available
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.claudeMdPath);
      }
      throw e;
    }
  }

  /**
   * Remove a registration
   *
   * @param {string} artifactType - Type: 'agent', 'skill', 'hook', 'workflow'
   * @param {string} artifactId - Artifact identifier
   * @returns {Promise<{success: boolean}>}
   */
  async deregister(artifactType, artifactId) {
    switch (artifactType) {
      case 'agent':
        return this._deregisterFromClaudeMd(artifactId, 'agents');
      case 'skill':
        return this._deregisterSkill(artifactId);
      case 'hook':
        return this._deregisterHook(artifactId);
      case 'workflow':
        return this._deregisterFromClaudeMd(artifactId, 'workflows');
      default:
        throw new Error(`Unknown artifact type: ${artifactType}`);
    }
  }

  /**
   * Remove registration from CLAUDE.md
   * @private
   */
  async _deregisterFromClaudeMd(artifactId, _section) {
    const backupPath = await this._createBackup(this.options.claudeMdPath);

    try {
      let content = fs.readFileSync(this.options.claudeMdPath, 'utf-8');

      // Remove lines containing the artifact ID
      const lines = content.split('\n');
      const filteredLines = lines.filter(line => !line.includes(artifactId));
      content = filteredLines.join('\n');

      fs.writeFileSync(this.options.claudeMdPath, content);

      return { success: true, backupPath };
    } catch (e) {
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.claudeMdPath);
      }
      throw e;
    }
  }

  /**
   * Remove skill registration
   * @private
   */
  async _deregisterSkill(skillId) {
    const backupPath = await this._createBackup(this.options.skillCatalogPath);

    try {
      let content = fs.readFileSync(this.options.skillCatalogPath, 'utf-8');

      // Remove lines containing the skill ID
      const lines = content.split('\n');
      const filteredLines = lines.filter(line => !line.includes(skillId));
      content = filteredLines.join('\n');

      fs.writeFileSync(this.options.skillCatalogPath, content);

      // Also remove from CLAUDE.md if present
      await this._deregisterFromClaudeMd(skillId, 'skills');

      return { success: true, backupPath };
    } catch (e) {
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.skillCatalogPath);
      }
      throw e;
    }
  }

  /**
   * Remove hook registration
   * @private
   */
  async _deregisterHook(hookId) {
    const backupPath = await this._createBackup(this.options.settingsJsonPath);

    try {
      // BUG-NEW-001 FIX: Use safeReadJSON for SEC-007 compliance
      const settings = safeReadJSON(this.options.settingsJsonPath, 'settings-json');

      if (settings.hooks) {
        settings.hooks = settings.hooks.filter(h => !h.path || !h.path.includes(hookId));
        fs.writeFileSync(this.options.settingsJsonPath, JSON.stringify(settings, null, 2));
      }

      return { success: true, backupPath };
    } catch (e) {
      if (backupPath && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, this.options.settingsJsonPath);
      }
      throw e;
    }
  }

  /**
   * Verify an artifact is registered
   *
   * @param {string} artifactType - Type: 'agent', 'skill', 'hook', 'workflow'
   * @param {string} artifactId - Artifact identifier
   * @returns {Promise<{registered: boolean, locations: string[]}>}
   */
  async verifyRegistration(artifactType, artifactId) {
    const locations = [];

    // Check CLAUDE.md
    if (fs.existsSync(this.options.claudeMdPath)) {
      const content = fs.readFileSync(this.options.claudeMdPath, 'utf-8');
      if (content.includes(artifactId)) {
        locations.push('claude-md');
      }
    }

    // Check skill catalog
    if (artifactType === 'skill' && fs.existsSync(this.options.skillCatalogPath)) {
      const content = fs.readFileSync(this.options.skillCatalogPath, 'utf-8');
      if (content.includes(artifactId)) {
        locations.push('skill-catalog');
      }
    }

    // Check settings.json for hooks
    if (artifactType === 'hook' && fs.existsSync(this.options.settingsJsonPath)) {
      // BUG-NEW-001 FIX: Use safeReadJSON for SEC-007 compliance
      const settings = safeReadJSON(this.options.settingsJsonPath, 'settings-json');
      if (settings.hooks && settings.hooks.some(h => h.path && h.path.includes(artifactId))) {
        locations.push('settings-json');
      }
    }

    return {
      registered: locations.length > 0,
      locations,
    };
  }

  /**
   * Update an existing registration
   *
   * @param {string} artifactType - Type: 'agent', 'skill', 'hook', 'workflow'
   * @param {string} artifactId - Artifact identifier
   * @param {Object} changes - Changes to apply
   * @returns {Promise<{success: boolean}>}
   */
  async updateRegistration(artifactType, artifactId, changes) {
    // For simplicity, deregister and re-register with updated info
    // In a production system, this would be more sophisticated

    const verification = await this.verifyRegistration(artifactType, artifactId);
    if (!verification.registered) {
      return { success: false, error: 'Artifact not registered' };
    }

    // Deregister
    await this.deregister(artifactType, artifactId);

    // Re-register with changes
    const mergedDef = { name: artifactId, ...changes };

    switch (artifactType) {
      case 'agent':
        await this.registerAgent(mergedDef);
        break;
      case 'skill':
        await this.registerSkill(mergedDef);
        break;
      case 'hook':
        await this.registerHook(mergedDef);
        break;
      case 'workflow':
        await this.registerWorkflow(mergedDef);
        break;
    }

    return { success: true };
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  SystemRegistrationHandler,
  DEFAULT_PATHS,
  CLAUDE_MD_SECTIONS,
};
