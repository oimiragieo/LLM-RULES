/**
 * SPEC-015: Conductor Gap Analyzer
 *
 * Analyzes conductor-main codebase to identify missing, redundant, and incompatible features
 * compared to agent-studio capabilities.
 *
 * Part of conductor-main integration readiness toolkit.
 */

const fs = require('fs');
const path = require('path');

class ConductorGapAnalyzer {
  constructor(conductorPath, agentStudioPath) {
    this.conductorPath = conductorPath;
    this.agentStudioPath = agentStudioPath;
  }

  /**
   * Analyze feature gaps between conductor-main and agent-studio
   * @returns {Promise<{missing: Array, redundant: Array, incompatible: Array, trackCount: number}>}
   */
  async analyzeFeatureGaps() {
    // Validate paths
    if (!fs.existsSync(this.conductorPath)) {
      throw new Error(`Conductor path does not exist: ${this.conductorPath}`);
    }

    if (!fs.existsSync(this.agentStudioPath)) {
      throw new Error(`Agent-studio path does not exist: ${this.agentStudioPath}`);
    }

    const missing = await this._findMissingFeatures();
    const redundant = await this._findRedundantFeatures();
    const incompatible = await this._findIncompatibleFeatures();
    const trackCount = await this._countTracks();

    return {
      missing,
      redundant,
      incompatible,
      trackCount
    };
  }

  /**
   * Compare codebases for size and complexity
   * @returns {Promise<{lineCount: {conductor: number, agentStudio: number}, complexity: {conductor: number, agentStudio: number}, commitCount: number}>}
   */
  async compareCodebases() {
    const conductorLines = await this._countLines(this.conductorPath);
    const agentStudioLines = await this._countLines(this.agentStudioPath);

    const conductorComplexity = await this._calculateComplexity(this.conductorPath);
    const agentStudioComplexity = await this._calculateComplexity(this.agentStudioPath);

    const commitCount = await this._countCommits(this.conductorPath);

    return {
      lineCount: {
        conductor: conductorLines,
        agentStudio: agentStudioLines
      },
      complexity: {
        conductor: conductorComplexity,
        agentStudio: agentStudioComplexity
      },
      commitCount
    };
  }

  /**
   * Identify patterns conductor-main has that agent-studio is missing
   * @returns {Promise<Array<{name: string, description: string, effort: string}>>}
   */
  async identifyMissingPatterns() {
    const patterns = [];

    // Check for git notes
    if (!await this._hasGitNotesHook(this.conductorPath)) {
      patterns.push({
        name: 'git-notes-audit hook',
        description: 'Automatic git notes attachment for commit metadata',
        effort: '2 hours'
      });
    }

    // Check for track metadata schema
    if (!await this._hasTrackMetadataSchema(this.conductorPath)) {
      patterns.push({
        name: 'track metadata schema',
        description: 'Validated metadata structure for tracks',
        effort: '1 hour'
      });
    }

    // Check for workflow checkpointing
    if (!await this._hasWorkflowCheckpointing(this.conductorPath)) {
      patterns.push({
        name: 'workflow checkpointing',
        description: 'State persistence and crash recovery',
        effort: '3 hours'
      });
    }

    // Check for brownfield detection
    if (!await this._hasBrownfieldDetection(this.conductorPath)) {
      patterns.push({
        name: 'brownfield detection',
        description: 'Automatic tech stack detection',
        effort: '4 hours'
      });
    }

    // Check conductor-specific patterns
    const conductorUnique = await this._findConductorUniquePatterns();
    if (conductorUnique.length > 0) {
      patterns.conductorUnique = conductorUnique;
    }

    return patterns;
  }

  /**
   * Generate markdown gap report
   * @returns {Promise<string>}
   */
  async generateGapReport() {
    const gaps = await this.analyzeFeatureGaps();
    const comparison = await this.compareCodebases();
    const patterns = await this.identifyMissingPatterns();

    let report = '# Gap Analysis Report\n\n';
    report += `**Conductor-Main**: ${this.conductorPath}\n`;
    report += `**Agent-Studio**: ${this.agentStudioPath}\n\n`;

    // Missing features
    report += '## Missing Features\n\n';
    report += 'Features agent-studio has that conductor-main is missing:\n\n';
    for (const feature of gaps.missing) {
      const featureName = typeof feature === 'string' ? feature : feature.name;
      const effort = typeof feature === 'string' ? 'Unknown' : feature.effort;
      const priority = this._assessPriority(featureName);
      report += `- **[${priority}]** ${featureName} (Effort: ${effort})\n`;
    }

    // Redundant features
    report += '\n## Redundant Features\n\n';
    report += 'Features conductor-main has that agent-studio deprecated:\n\n';
    for (const feature of gaps.redundant) {
      report += `- ${feature}\n`;
    }

    // Incompatible features
    report += '\n## Incompatible Features\n\n';
    report += 'Features with schema/format differences:\n\n';
    for (const feature of gaps.incompatible) {
      report += `- ${feature}\n`;
    }

    // Statistics
    report += '\n## Statistics\n\n';
    report += `- **Tracks**: ${gaps.trackCount}\n`;
    report += `- **Lines of Code**: Conductor ${comparison.lineCount.conductor}, Agent-Studio ${comparison.lineCount.agentStudio}\n`;
    report += `- **Complexity**: Conductor ${comparison.complexity.conductor}, Agent-Studio ${comparison.complexity.agentStudio}\n`;
    report += `- **Commits**: ${comparison.commitCount}\n`;

    // Recommendations
    report += '\n## Recommendations\n\n';
    report += this._generateRecommendations(gaps, patterns);

    return report;
  }

  // Private helpers

  async _findMissingFeatures() {
    const missing = [];

    // Tech stack auto-generation
    if (!await this._fileExists(this.conductorPath, 'tech-stack.md')) {
      missing.push({
        name: 'tech-stack.md auto-generation (SPEC-005)',
        effort: '1 hour',
        estimatedHours: 1
      });
    }

    // Git notes audit
    if (!await this._hasGitNotesHook(this.conductorPath)) {
      missing.push({
        name: 'git-notes-audit hook (SPEC-002)',
        effort: '2 hours',
        estimatedHours: 2
      });
    }

    // Track analytics
    if (!await this._fileExists(this.conductorPath, '.claude/lib/utils/track-analytics.cjs')) {
      missing.push({
        name: 'track-analytics module (SPEC-008)',
        effort: '2 hours',
        estimatedHours: 2
      });
    }

    // Brownfield detection
    if (!await this._fileExists(this.conductorPath, '.claude/lib/utils/brownfield-detector.cjs')) {
      missing.push({
        name: 'brownfield-detection module (SPEC-005)',
        effort: '4 hours',
        estimatedHours: 4
      });
    }

    return missing;
  }

  async _findRedundantFeatures() {
    const redundant = [];

    // Check for deprecated patterns (example)
    if (await this._fileExists(this.conductorPath, 'legacy-config.xml')) {
      redundant.push('legacy-config.xml (deprecated in favor of config.json)');
    }

    return redundant;
  }

  async _findIncompatibleFeatures() {
    const incompatible = [];

    // Workflow state format
    if (await this._fileExists(this.conductorPath, 'setup_state.json')) {
      incompatible.push('workflow-state format (setup_state.json vs workflow-state.schema.json)');
    }

    return incompatible;
  }

  async _countTracks() {
    const tracksDir = path.join(this.conductorPath, 'tracks');
    if (!fs.existsSync(tracksDir)) {
      return 0;
    }

    const entries = fs.readdirSync(tracksDir, { withFileTypes: true });
    const trackDirs = entries.filter(e => e.isDirectory());

    return trackDirs.length;
  }

  async _countLines(dirPath) {
    let total = 0;

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, .git
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          // Count lines in code files
          if (/\.(js|cjs|mjs|ts|md|json)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            total += content.split('\n').length;
          }
        }
      }
    };

    walk(dirPath);
    return total;
  }

  async _calculateComplexity(dirPath) {
    // Simple complexity metric: average cyclomatic complexity
    // For this implementation, use line count / files as proxy
    const lines = await this._countLines(dirPath);
    const fileCount = await this._countFiles(dirPath);

    return fileCount > 0 ? Math.round(lines / fileCount) : 0;
  }

  async _countFiles(dirPath) {
    let count = 0;

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          if (/\.(js|cjs|mjs|ts|md|json)$/.test(entry.name)) {
            count++;
          }
        }
      }
    };

    walk(dirPath);
    return count;
  }

  async _countCommits(dirPath) {
    // Mock: Return 0 (git operations require real git repo)
    return 0;
  }

  async _hasGitNotesHook(dirPath) {
    return await this._fileExists(dirPath, '.claude/hooks/audit/git-notes-audit.cjs');
  }

  async _hasTrackMetadataSchema(dirPath) {
    return await this._fileExists(dirPath, '.claude/schemas/track-metadata.schema.json');
  }

  async _hasWorkflowCheckpointing(dirPath) {
    return await this._fileExists(dirPath, '.claude/lib/workflow/workflow-state-manager.cjs');
  }

  async _hasBrownfieldDetection(dirPath) {
    return await this._fileExists(dirPath, '.claude/lib/utils/brownfield-detector.cjs');
  }

  async _findConductorUniquePatterns() {
    const unique = [];

    // Check for custom tools
    const toolsDir = path.join(this.conductorPath, 'tools');
    if (fs.existsSync(toolsDir)) {
      const tools = fs.readdirSync(toolsDir);
      for (const tool of tools) {
        if (!await this._fileExists(this.agentStudioPath, `tools/${tool}`)) {
          unique.push({
            name: `custom-tool: ${tool}`,
            description: `Conductor-specific tool not in agent-studio`
          });
        }
      }
    }

    return unique;
  }

  async _fileExists(basePath, relativePath) {
    return fs.existsSync(path.join(basePath, relativePath));
  }

  _assessPriority(feature) {
    const highPriority = ['git-notes', 'track-analytics', 'workflow-state'];
    const mediumPriority = ['brownfield-detection', 'tech-stack'];

    for (const pattern of highPriority) {
      if (feature.toLowerCase().includes(pattern)) return 'HIGH';
    }

    for (const pattern of mediumPriority) {
      if (feature.toLowerCase().includes(pattern)) return 'MEDIUM';
    }

    return 'LOW';
  }

  _generateRecommendations(gaps, patterns) {
    let recommendations = '';

    // High-priority recommendations
    if (gaps.missing.some(f => f.includes('git-notes'))) {
      recommendations += '1. Enable git-notes-audit hook for commit traceability\n';
    }

    if (gaps.incompatible.some(f => f.includes('workflow-state'))) {
      recommendations += '2. Migrate setup_state.json to workflow-state.schema.json format\n';
    }

    if (gaps.missing.some(f => f.includes('track-analytics'))) {
      recommendations += '3. Install track-analytics module for project metrics\n';
    }

    return recommendations;
  }
}

module.exports = { ConductorGapAnalyzer };
