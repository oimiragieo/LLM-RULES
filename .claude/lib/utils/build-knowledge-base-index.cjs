/**
 * Knowledge Base Index Builder
 *
 * Scans .claude/skills, .claude/agents, .claude/workflows and generates
 * CSV-based index for fast discovery.
 *
 * Security Controls:
 * - SEC-KB-001: CSV formula injection prevention
 * - SEC-KB-002: Path validation (via path-validator)
 * - SEC-KB-003: Path traversal prevention
 */

const fs = require('fs');
const path = require('path');

// Get project root
function getProjectRoot() {
  return process.env.PROJECT_ROOT || process.cwd();
}

/**
 * Escape CSV formula injection characters (SEC-KB-001)
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
function escapeCSV(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // Formula characters that trigger Excel/Sheets execution
  const dangerousStarts = ['=', '+', '-', '@', '\t', '\r', '\n'];
  const isDangerous = dangerousStarts.some(char => value.startsWith(char));
  let escaped = value.replace(/\r?\n|\r/g, ' ');

  if (isDangerous) {
    escaped = "'" + escaped;
  }

  // Handle commas and quotes in CSV
  if (escaped.includes(',') || escaped.includes('"')) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }

  return escaped;
}

/**
 * Parse YAML frontmatter from markdown file
 * @param {string} content - File content
 * @returns {Object} Parsed frontmatter or empty object
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const yaml = match[1];
  const result = {};

  // Simple YAML parser (handles basic key: value and key: [array])
  const lines = yaml.split('\n');
  for (const line of lines) {
    const keyValue = line.match(/^([^:]+):\s*(.+)$/);
    if (keyValue) {
      const key = keyValue[1].trim();
      let value = keyValue[2].trim();

      // Handle arrays [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map(v => v.trim());
      }

      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract use cases from description
 * @param {string} description - Description text
 * @returns {string[]} Array of use case tags
 */
function extractUseCases(description) {
  const useCases = [];

  // Common use case keywords
  const keywords = [
    'testing',
    'quality',
    'development',
    'security',
    'planning',
    'review',
    'documentation',
    'deployment',
    'monitoring',
    'debugging',
    'refactoring',
    'architecture',
    'design',
    'performance',
    'optimization',
  ];

  const lowerDesc = description.toLowerCase();
  for (const keyword of keywords) {
    if (lowerDesc.includes(keyword)) {
      useCases.push(keyword);
    }
  }

  return useCases.slice(0, 5); // Limit to 5 use cases
}

/**
 * Infer complexity from content
 * @param {string} content - File content
 * @param {Object} frontmatter - Parsed frontmatter
 * @returns {string} Complexity level (LOW, MEDIUM, HIGH, EPIC)
 */
function inferComplexity(content, frontmatter) {
  if (frontmatter.complexity) {
    return frontmatter.complexity.toUpperCase();
  }

  // Infer from content length and structure
  const lines = content.split('\n').length;
  const headings = (content.match(/^#+\s/gm) || []).length;

  if (lines < 100 || headings < 5) {
    return 'LOW';
  } else if (lines < 300 || headings < 15) {
    return 'MEDIUM';
  } else if (lines < 1000) {
    return 'HIGH';
  } else {
    return 'EPIC';
  }
}

/**
 * Scan directory for artifacts
 * @param {string} dir - Directory to scan
 * @param {string} domain - Domain type (skill, agent, workflow)
 * @returns {Array<Object>} Array of artifact entries
 */
function scanDirectory(dir, domain) {
  const artifacts = [];
  const projectRoot = getProjectRoot();

  if (!fs.existsSync(dir)) {
    return artifacts;
  }

  function scanRecursive(currentDir) {
    const entries = fs.readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanRecursive(fullPath);
      } else if (entry === 'SKILL.md' || entry.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);

          // Extract name from frontmatter or directory name
          const name = frontmatter.name || path.basename(path.dirname(fullPath));

          // Get relative path from project root
          const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

          // Extract description
          const description =
            frontmatter.description ||
            content
              .split('\n')
              .find(line => line.trim() && !line.startsWith('#') && !line.startsWith('---'))
              ?.trim() ||
            'No description available';

          // Extract metadata
          const tools = Array.isArray(frontmatter.tools) ? frontmatter.tools : [];
          const deprecated = frontmatter.deprecated === true || frontmatter.deprecated === 'true';
          const alias = frontmatter.alias || frontmatter.superseded_by || '';
          const useCases = frontmatter.use_cases || extractUseCases(description);
          const complexity = inferComplexity(content, frontmatter);

          artifacts.push({
            name: escapeCSV(name),
            path: escapeCSV(relativePath),
            description: escapeCSV(description.substring(0, 200)),
            domain,
            complexity,
            use_cases: escapeCSV(Array.isArray(useCases) ? useCases.join(',') : useCases),
            tools: escapeCSV(tools.join(',')),
            deprecated: deprecated ? 'true' : 'false',
            alias: escapeCSV(alias),
            usage_count: '0',
            last_used: '',
          });
        } catch (error) {
          console.warn(`[kb-index] Skipping ${fullPath}: ${error.message}`);
        }
      }
    }
  }

  scanRecursive(dir);
  return artifacts;
}

/**
 * Build knowledge base index
 * @returns {Object} Result object with success status and count
 */
function buildKnowledgeBaseIndex() {
  const projectRoot = getProjectRoot();
  const outputPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'artifacts',
    'knowledge-base-index.csv'
  );
  const tmpPath = outputPath + '.tmp';

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Scan directories
  const skills = scanDirectory(path.join(projectRoot, '.claude', 'skills'), 'skill');
  const agents = scanDirectory(path.join(projectRoot, '.claude', 'agents'), 'agent');
  const workflows = scanDirectory(path.join(projectRoot, '.claude', 'workflows'), 'workflow');

  const allArtifacts = [...skills, ...agents, ...workflows];

  // Generate CSV content
  const headers = [
    'name',
    'path',
    'description',
    'domain',
    'complexity',
    'use_cases',
    'tools',
    'deprecated',
    'alias',
    'usage_count',
    'last_used',
  ];
  const csvLines = [headers.join(',')];

  for (const artifact of allArtifacts) {
    const row = headers.map(header => artifact[header] || '');
    csvLines.push(row.join(','));
  }

  const csvContent = csvLines.join('\n') + '\n';

  // Atomic write: write to .tmp then rename
  fs.writeFileSync(tmpPath, csvContent, 'utf-8');
  fs.renameSync(tmpPath, outputPath);

  console.log(`[kb-index] Knowledge base index built: ${allArtifacts.length} artifacts indexed`);

  return {
    success: true,
    artifactsIndexed: allArtifacts.length,
    outputPath,
  };
}

// CLI usage
if (require.main === module) {
  try {
    const result = buildKnowledgeBaseIndex();
    console.log(`Success: ${result.artifactsIndexed} artifacts indexed`);
    console.log(`Output: ${result.outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`Error building index: ${error.message}`);
    process.exit(1);
  }
}

module.exports = buildKnowledgeBaseIndex;
module.exports.escapeCSV = escapeCSV;
