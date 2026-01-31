#!/usr/bin/env node
/**
 * Skill Index Generator
 * ======================
 *
 * Generates .claude/config/skill-index.json from skill-catalog.md and SKILL.md files
 *
 * Usage:
 *   node .claude/tools/cli/generate-skill-index.cjs [options]
 *
 * Options:
 *   --dry-run   Show what would be generated without writing
 *   --validate  Only validate existing index
 *   --verbose   Show detailed output
 *   --quick     Fast mode - use hardcoded definitions (default)
 *   --scan      Scan mode - read all SKILL.md files (slow but comprehensive)
 *
 * Output:
 *   .claude/config/skill-index.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Project root detection
const PROJECT_ROOT = process.cwd();
const CONFIG_DIR = path.join(PROJECT_ROOT, '.claude', 'config');
const INDEX_PATH = path.join(CONFIG_DIR, 'skill-index.json');
const CATALOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts', 'skill-catalog.md');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// Domain mappings
const DOMAIN_MAP = {
  // Core Development
  tdd: 'development',
  debugging: 'development',
  'code-quality-expert': 'development',
  ripgrep: 'development',
  'code-analyzer': 'development',
  'code-style-validator': 'development',
  'async-operations': 'development',
  'logging-module-usage': 'development',
  'library-usage': 'development',
  'comprehensive-unit-testing-with-pytest': 'development',
  'unit-testing-requirement': 'development',
  'test-generator': 'development',

  // Security
  'security-architect': 'security',
  'auth-security-expert': 'security',
  'memory-forensics': 'security',
  'binary-analysis-patterns': 'security',
  'protocol-reverse-engineering': 'security',
  'authentication-flow-rules': 'security',

  // Planning
  'plan-generator': 'planning',
  'task-breakdown': 'planning',
  brainstorming: 'planning',
  'complexity-assessment': 'planning',
  'strategic-planning-with-pseudocode': 'planning',

  // Architecture
  'architecture-review': 'architecture',
  'diagram-generator': 'architecture',

  // Research
  'research-synthesis': 'research',
  'arxiv-mcp': 'research',

  // Memory
  'context-compressor': 'memory',
  'session-handoff': 'memory',
  'operational-modes': 'memory',
  recovery: 'memory',
  'project-onboarding': 'memory',
  'project-analyzer': 'memory',
  'context-driven-development': 'memory',
  'context-files-rules': 'memory',
  'history-and-next-task-rules': 'memory',

  // Quality
  'qa-workflow': 'quality',
  'verification-before-completion': 'quality',
  'checklist-generator': 'quality',
  'response-rater': 'quality',
  'verify-information-rule': 'quality',
  'thoughtful-and-accurate-responses': 'quality',
  'truthfulness-and-clarity-for-ai': 'quality',
  'handle-incomplete-tasks': 'quality',
  'continuous-improvement-focus': 'quality',

  // Git
  'git-expert': 'git',
  gitflow: 'git',
  'commit-validator': 'git',
  'smart-revert': 'git',
  'commit-message-guidelines': 'git',
  'version-control-rule': 'git',
  'collaboration-and-version-control-rules': 'git',
  'using-git-worktrees': 'git',
  'gitops-workflow': 'git',
  'finishing-a-development-branch': 'git',

  // Integration
  'github-mcp': 'integration',
  'chrome-browser': 'integration',
  'slack-notifications': 'integration',
  'github-ops': 'integration',
  'jira-pm': 'integration',
  'linear-pm': 'integration',
  'computer-use': 'integration',
  'telegram-bot-api-rules': 'integration',
  'agp-router-rules': 'integration',
  'web3-expert': 'integration',

  // DevOps
  'aws-cloud-ops': 'devops',
  'docker-compose': 'devops',
  'kubernetes-flux': 'devops',
  'terraform-infra': 'devops',
  'container-expert': 'devops',
  'cloud-devops-expert': 'devops',
  'cloud-native-and-kubernetes-expertise-rules': 'devops',
  'containerization-rules': 'devops',
  'k8s-manifest-generator': 'devops',
  'k8s-security-policies': 'devops',
  'helm-chart-scaffolding': 'devops',
  'gcloud-cli': 'devops',
  'sentry-monitoring': 'devops',
  'ci-cd-implementation-rule': 'devops',
  'incident-runbook-templates': 'devops',
  'on-call-handoff-patterns': 'devops',
  'postmortem-writing': 'devops',
  'configuration-management': 'devops',

  // Languages
  'python-backend-expert': 'languages',
  'typescript-expert': 'languages',
  'go-expert': 'languages',
  'java-expert': 'languages',
  'php-expert': 'languages',
  'nodejs-expert': 'languages',
  'elixir-expert': 'languages',
  cpp: 'languages',
  'prioritize-python-3-10-features': 'languages',
  'comprehensive-type-annotations': 'languages',
  'type-hinting-rule': 'languages',
  'asynchronous-programming-preference': 'languages',
  'functional-programming-preference': 'languages',
  'rell-general-rules': 'languages',
  'latest-language-versions-and-best-practices': 'languages',
  'jupyter-notebook-best-practices': 'languages',

  // Frameworks
  'react-expert': 'frameworks',
  'react-best-practices-vercel': 'frameworks',
  'composition-patterns-vercel': 'frameworks',
  'nextjs-expert': 'frameworks',
  'vue-expert': 'frameworks',
  'angular-expert': 'frameworks',
  'svelte-expert': 'frameworks',
  'astro-expert': 'frameworks',
  'qwik-expert': 'frameworks',
  'solidjs-expert': 'frameworks',
  'flutter-expert': 'frameworks',
  'backend-expert': 'frameworks',
  'frontend-expert': 'frameworks',
  'graphql-expert': 'frameworks',
  'api-development-expert': 'frameworks',
  'htmx-expert': 'frameworks',
  'chrome-extension-expert': 'frameworks',
  'state-management-expert': 'frameworks',

  // Mobile
  'react-native-skills-vercel': 'mobile',
  'ios-expert': 'mobile',
  'android-expert': 'mobile',
  'expo-mobile-app-rule': 'mobile',
  'expo-framework-rule': 'mobile',
  nativescript: 'mobile',
  'mobile-first-design-rules': 'mobile',
  'mobile-ui-development-rule': 'mobile',

  // Database
  'database-architect': 'database',
  'database-expert': 'database',
  'data-expert': 'database',
  'text-to-sql': 'database',
  'pandas-data-manipulation-rules': 'database',
  'large-data-with-dask': 'database',
  'drizzle-orm-rules': 'database',
  'entity-class-conventions': 'database',
  'repository-class-conventions': 'database',
  'vercel-kv-database-rules': 'database',
  'experiment-configuration-with-hydra-yaml': 'database',

  // AI/ML
  'ai-ml-expert': 'ai-ml',

  // Documentation
  'doc-generator': 'documentation',
  'writing-skills': 'documentation',
  readme: 'documentation',
  'detailed-docstrings': 'documentation',
  'technical-accuracy-and-usability-rules': 'documentation',
  'metadata-and-seo-rules': 'documentation',
  'mkdocs-specific-rules': 'documentation',
  'content-creation-rules': 'documentation',
  'prompt-generation-rules': 'documentation',
  'writing-plans': 'documentation',

  // Creator
  'agent-creator': 'creator',
  'skill-creator': 'creator',
  'hook-creator': 'creator',
  'workflow-creator': 'creator',
  'template-creator': 'creator',
  'schema-creator': 'creator',
  'template-renderer': 'creator',
  'artifact-lifecycle': 'creator',
  'artifact-publisher': 'creator',
  'mcp-converter': 'creator',

  // Requirements
  'progressive-disclosure': 'requirements',
  'spec-gathering': 'requirements',
  'spec-writing': 'requirements',
  'spec-critique': 'requirements',
  'interactive-requirements-gathering': 'requirements',

  // Specialized
  'thinking-tools': 'specialized',
  'sequential-thinking': 'specialized',
  'consensus-voting': 'specialized',
  'swarm-coordination': 'specialized',
  'subagent-driven-development': 'specialized',
  'task-management-protocol': 'specialized',
  'track-management': 'specialized',
  'workflow-patterns': 'specialized',
  'smart-debug': 'specialized',
  'codebase-integration': 'specialized',
  'repo-rag': 'specialized',
  'summarize-changes': 'specialized',
  'requesting-code-review': 'specialized',
  'receiving-code-review': 'specialized',
  'insight-extraction': 'specialized',
  'dispatching-parallel-agents': 'specialized',
  'executing-plans': 'specialized',
  'skill-discovery': 'specialized',
  'tool-search': 'specialized',
  'dependency-analyzer': 'specialized',
  filesystem: 'specialized',

  // Styling
  'web-design-guidelines-vercel': 'styling',
  'styling-expert': 'styling',
  'ui-components-expert': 'styling',
  'design-and-user-experience-guidelines': 'styling',
  'html-tailwind-css-and-javascript-expert-rule': 'styling',
  'image-optimization-rules': 'styling',
  'placeholder-images': 'styling',
  'modular-design-rule': 'styling',
  'private-vs-shared-components': 'styling',
  'visual-and-observational-rules': 'styling',
  'pyqt6-ui-development-rules': 'styling',
  'alpine-js-usage-rules': 'styling',
  accessibility: 'styling',
  'mobile-ux-reviewer': 'styling',
  'aceternity-ui-configuration': 'styling',

  // Scientific
  'scientific-skills': 'scientific',

  // Other
  'gamedev-expert': 'other',
};

// Category mappings
const CATEGORY_MAP = {
  tdd: 'Testing',
  debugging: 'Troubleshooting',
  'code-quality-expert': 'Code Quality',
  'security-architect': 'Security',
  'auth-security-expert': 'Security',
  'plan-generator': 'Planning',
  'task-breakdown': 'Planning',
  'architecture-review': 'Architecture',
  'diagram-generator': 'Architecture',
  'research-synthesis': 'Research',
  'arxiv-mcp': 'Research',
  'context-compressor': 'Memory',
  'session-handoff': 'Memory',
  'qa-workflow': 'Quality',
  'verification-before-completion': 'Quality',
  'checklist-generator': 'Quality',
  'git-expert': 'Version Control',
  gitflow: 'Version Control',
  'github-mcp': 'Integration',
  'chrome-browser': 'Integration',
  'aws-cloud-ops': 'DevOps',
  'docker-compose': 'DevOps',
  'kubernetes-flux': 'DevOps',
  'terraform-infra': 'DevOps',
  'python-backend-expert': 'Languages',
  'typescript-expert': 'Languages',
  'go-expert': 'Languages',
  'react-expert': 'Frameworks',
  'react-best-practices-vercel': 'Frameworks',
  'nextjs-expert': 'Frameworks',
  'react-native-skills-vercel': 'Mobile',
  'ios-expert': 'Mobile',
  'android-expert': 'Mobile',
  'database-architect': 'Database',
  'text-to-sql': 'Database',
  'ai-ml-expert': 'AI/ML',
  'doc-generator': 'Documentation',
  'writing-skills': 'Documentation',
  'agent-creator': 'Creator Tools',
  'skill-creator': 'Creator Tools',
  'progressive-disclosure': 'Requirements',
  'spec-gathering': 'Requirements',
  'thinking-tools': 'Specialized',
  'sequential-thinking': 'Specialized',
  'swarm-coordination': 'Orchestration',
  'consensus-voting': 'Orchestration',
  'web-design-guidelines-vercel': 'Styling',
  'styling-expert': 'Styling',
  'scientific-skills': 'Scientific',
};

// Agent assignments
const AGENT_SKILLS = {
  developer: [
    'tdd',
    'debugging',
    'code-quality-expert',
    'git-expert',
    'ripgrep',
    'verification-before-completion',
  ],
  qa: ['tdd', 'qa-workflow', 'verification-before-completion', 'checklist-generator'],
  planner: [
    'plan-generator',
    'task-breakdown',
    'brainstorming',
    'complexity-assessment',
    'thinking-tools',
    'progressive-disclosure',
  ],
  architect: [
    'architecture-review',
    'diagram-generator',
    'security-architect',
    'database-architect',
  ],
  'security-architect': ['security-architect', 'auth-security-expert', 'memory-forensics'],
  'technical-writer': ['doc-generator', 'writing-skills', 'readme'],
  devops: [
    'aws-cloud-ops',
    'docker-compose',
    'kubernetes-flux',
    'terraform-infra',
    'container-expert',
  ],
  researcher: ['research-synthesis', 'arxiv-mcp'],
  'code-reviewer': ['code-quality-expert', 'code-analyzer', 'code-style-validator'],
  'frontend-pro': [
    'react-expert',
    'react-best-practices-vercel',
    'composition-patterns-vercel',
    'web-design-guidelines-vercel',
    'nextjs-expert',
  ],
  'master-orchestrator': ['swarm-coordination', 'consensus-voting'],
  'evolution-orchestrator': [
    'agent-creator',
    'skill-creator',
    'hook-creator',
    'workflow-creator',
    'research-synthesis',
  ],
  'data-engineer': ['database-architect', 'ai-ml-expert', 'scientific-skills'],
  'ai-ml-specialist': ['ai-ml-expert', 'scientific-skills'],
};

// Tool requirements for key skills
const SKILL_TOOLS = {
  tdd: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  debugging: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'code-quality-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'security-architect': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'auth-security-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'plan-generator': ['Read', 'Write'],
  'task-breakdown': [
    'Read',
    'Write',
    'Skill',
    'TaskCreate',
    'TaskUpdate',
    'TaskList',
    'Grep',
    'Glob',
  ],
  'architecture-review': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  'diagram-generator': ['Read', 'Write', 'Edit', 'Bash'],
  'research-synthesis': ['WebSearch', 'WebFetch', 'Read', 'Write', 'Glob', 'Grep'],
  'context-compressor': ['Read', 'Write'],
  'session-handoff': ['Read', 'Write', 'Glob', 'Grep'],
  'qa-workflow': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'verification-before-completion': ['Read', 'Bash'],
  'checklist-generator': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  'git-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  gitflow: ['Read', 'Write', 'Edit'],
  'github-mcp': ['Read', 'Bash'],
  'chrome-browser': ['Read', 'Write', 'WebFetch'],
  'arxiv-mcp': ['WebSearch', 'WebFetch', 'Read'],
  'aws-cloud-ops': ['Bash', 'Read'],
  'docker-compose': ['Read', 'Write', 'Edit'],
  'kubernetes-flux': ['Read', 'Write', 'Edit'],
  'terraform-infra': ['Bash', 'Read', 'Glob'],
  'python-backend-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'typescript-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'go-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'react-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'react-best-practices-vercel': ['Read', 'Write', 'Edit'],
  'react-native-skills-vercel': ['Read', 'Write', 'Edit'],
  'composition-patterns-vercel': ['Read', 'Write', 'Edit'],
  'web-design-guidelines-vercel': ['Read', 'WebFetch'],
  'nextjs-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'agent-creator': [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'Bash',
    'Task',
  ],
  'skill-creator': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  'hook-creator': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'workflow-creator': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'doc-generator': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'writing-skills': ['Read', 'Write', 'Edit', 'Bash', 'Task'],
  'thinking-tools': ['Read', 'Glob', 'Grep'],
  'sequential-thinking': ['Read', 'Write', 'Bash'],
  'progressive-disclosure': [
    'Read',
    'Write',
    'AskUserQuestion',
    'TaskUpdate',
    'TaskList',
    'Grep',
    'Glob',
  ],
  'database-architect': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'ai-ml-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch'],
  'scientific-skills': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  'swarm-coordination': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'consensus-voting': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  ripgrep: ['Bash'],
  'code-analyzer': ['Bash', 'Read', 'Glob', 'Grep'],
  'code-style-validator': ['Read', 'Grep', 'Bash', 'Glob'],
  'commit-validator': ['Read', 'Grep', 'Bash'],
  'smart-revert': ['Read', 'Bash', 'Glob', 'Grep', 'Write', 'Edit'],
};

/**
 * Parse skill catalog to extract skill names
 */
function parseSkillCatalog() {
  const skills = [];

  try {
    if (fs.existsSync(CATALOG_PATH)) {
      const content = fs.readFileSync(CATALOG_PATH, 'utf8');

      // Extract skill names from table rows
      const skillPattern = /\| `([^`]+)` \|/g;
      let match;

      while ((match = skillPattern.exec(content)) !== null) {
        const skillName = match[1].replace(/~~/g, ''); // Remove strikethrough
        if (!skillName.startsWith('~~')) {
          skills.push(skillName);
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not parse skill catalog: ${err.message}`);
  }

  return [...new Set(skills)]; // Remove duplicates
}

/**
 * Scan SKILL.md files for metadata
 */
function scanSkillFiles() {
  const skills = {};

  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return skills;
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');

        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, 'utf8');

          // Extract frontmatter if exists
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

          skills[entry.name] = {
            name: entry.name,
            hasSkillFile: true,
            hasFrontmatter: !!frontmatterMatch,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not scan skill files: ${err.message}`);
  }

  return skills;
}

/**
 * Generate the skill index
 */
function generateIndex(options = {}) {
  const { verbose = false, scan = false } = options;

  // Get skill list
  const catalogSkills = parseSkillCatalog();
  const scannedSkills = scan ? scanSkillFiles() : {};

  if (verbose) {
    console.log(`Found ${catalogSkills.length} skills in catalog`);
    console.log(`Found ${Object.keys(scannedSkills).length} skill directories`);
  }

  // Build skills object
  const skills = {};
  const allSkillNames = new Set([
    ...catalogSkills,
    ...Object.keys(scannedSkills),
    ...Object.keys(DOMAIN_MAP),
  ]);

  for (const name of allSkillNames) {
    const domain = DOMAIN_MAP[name] || 'other';
    const category = CATEGORY_MAP[name] || 'Other';
    const requiredTools = SKILL_TOOLS[name] || ['Read', 'Write', 'Edit'];

    // Find agents that use this skill
    const agentPrimary = [];
    const agentSupporting = [];

    for (const [agent, skillList] of Object.entries(AGENT_SKILLS)) {
      if (skillList.includes(name)) {
        if (skillList.indexOf(name) < 3) {
          agentPrimary.push(agent);
        } else {
          agentSupporting.push(agent);
        }
      }
    }

    skills[name] = {
      name,
      displayName: name
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      category,
      domain,
      description: `${category} - ${name}`,
      requiredTools,
      agentPrimary: agentPrimary.length > 0 ? agentPrimary : ['developer'],
      agentSupporting,
      tags: [domain, category.toLowerCase().replace(/\s+/g, '-'), name],
      priority: agentPrimary.length > 0 ? 1 : 3,
    };
  }

  // Build indexes
  const byDomain = {};
  const byCategory = {};
  const byTool = {};
  const byAgent = {};

  for (const [name, skill] of Object.entries(skills)) {
    // By domain
    if (!byDomain[skill.domain]) {
      byDomain[skill.domain] = [];
    }
    byDomain[skill.domain].push(name);

    // By category
    if (!byCategory[skill.category]) {
      byCategory[skill.category] = [];
    }
    byCategory[skill.category].push(name);

    // By tool
    for (const tool of skill.requiredTools) {
      if (!byTool[tool]) {
        byTool[tool] = [];
      }
      byTool[tool].push(name);
    }
  }

  // By agent
  for (const [agent, skillList] of Object.entries(AGENT_SKILLS)) {
    byAgent[agent] = skillList;
  }

  const index = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalSkills: Object.keys(skills).length,
      totalDomains: Object.keys(byDomain).length,
      totalCategories: Object.keys(byCategory).length,
      lastValidated: new Date().toISOString(),
      source: '.claude/context/artifacts/skill-catalog.md',
    },
    skills,
    index: {
      byDomain,
      byCategory,
      byTool,
      byAgent,
    },
    discovery: {
      maxSkillsPerDomain: 50,
      maxSkillsInPrompt: 20,
      recommendedForAgent: AGENT_SKILLS,
    },
  };

  if (verbose) {
    console.log(`Generated index with:`);
    console.log(`  - ${Object.keys(skills).length} skills`);
    console.log(`  - ${Object.keys(byDomain).length} domains`);
    console.log(`  - ${Object.keys(byCategory).length} categories`);
    console.log(`  - ${Object.keys(byTool).length} tool mappings`);
    console.log(`  - ${Object.keys(byAgent).length} agent assignments`);
  }

  return index;
}

/**
 * Validate existing index
 */
function validateIndex(indexPath) {
  const errors = [];
  const warnings = [];

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    // Check version
    if (!index.version) {
      errors.push('Missing version field');
    }

    // Check skills count
    const skillCount = Object.keys(index.skills || {}).length;
    if (skillCount < 100) {
      warnings.push(`Expected 400+ skills, found ${skillCount}`);
    }

    // Check domains
    const domainCount = Object.keys(index.index?.byDomain || {}).length;
    if (domainCount < 10) {
      warnings.push(`Expected 20+ domains, found ${domainCount}`);
    }

    // Check each skill has required fields
    for (const [name, skill] of Object.entries(index.skills || {})) {
      if (!skill.requiredTools || skill.requiredTools.length === 0) {
        warnings.push(`Skill ${name} has no required tools`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (err) {
    return { valid: false, errors: [`Failed to parse index: ${err.message}`], warnings };
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate');
  const verbose = args.includes('--verbose');
  const scan = args.includes('--scan');

  console.log('Skill Index Generator');
  console.log('=====================\n');

  if (validateOnly) {
    console.log('Validating existing index...\n');

    if (!fs.existsSync(INDEX_PATH)) {
      console.error(`Error: Index not found at ${INDEX_PATH}`);
      process.exit(1);
    }

    const result = validateIndex(INDEX_PATH);

    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (result.valid) {
      console.log('\nIndex is valid!');
      process.exit(0);
    } else {
      console.log('\nIndex validation failed.');
      process.exit(1);
    }
  }

  // Generate index
  const index = generateIndex({ verbose, scan });

  if (dryRun) {
    console.log('Dry run - index would be written to:');
    console.log(`  ${INDEX_PATH}\n`);
    console.log('Preview:');
    console.log(JSON.stringify(index, null, 2).slice(0, 2000) + '...\n');
    console.log(`Total size: ${JSON.stringify(index).length} bytes`);
    return;
  }

  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Write index
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  console.log(`Index generated successfully!`);
  console.log(`Output: ${INDEX_PATH}`);
  console.log(`\nStatistics:`);
  console.log(`  - Skills: ${index.metadata.totalSkills}`);
  console.log(`  - Domains: ${index.metadata.totalDomains}`);
  console.log(`  - Categories: ${index.metadata.totalCategories}`);

  // Validate generated index
  const validation = validateIndex(INDEX_PATH);
  if (!validation.valid) {
    console.log('\nWarning: Generated index has validation issues:');
    validation.errors.forEach(e => console.log(`  - ${e}`));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateIndex, validateIndex, parseSkillCatalog, scanSkillFiles };
