'use strict';

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
  'comprehensive-unit-testing-with-pytest': 'development',
  'test-generator': 'development',

  // Security
  'security-architect': 'security',
  'auth-security-expert': 'security',
  'memory-forensics': 'security',
  'binary-analysis-patterns': 'security',
  'protocol-reverse-engineering': 'security',

  // Planning
  'plan-generator': 'planning',
  'complexity-assessment': 'planning',

  // Architecture
  'architecture-review': 'architecture',
  'diagram-generator': 'architecture',

  // Research
  'research-synthesis': 'research',
  'arxiv-mcp': 'research',

  // Memory
  'context-compressor': 'memory',
  'session-handoff': 'memory',
  recovery: 'memory',
  'project-onboarding': 'memory',
  'project-analyzer': 'memory',
  'context-driven-development': 'memory',
  'framework-context': 'memory',
  'recommend-evolution': 'memory',

  // Quality
  'verification-before-completion': 'quality',
  'checklist-generator': 'quality',
  'response-rater': 'quality',

  // Git
  'git-expert': 'git',
  'gitops-workflow': 'git',

  // Integration
  'github-mcp': 'integration',
  'chrome-browser': 'integration',
  'slack-notifications': 'integration',
  'github-ops': 'integration',
  'web3-expert': 'integration',

  // DevOps
  'aws-cloud-ops': 'devops',
  'docker-compose': 'devops',
  'kubernetes-flux': 'devops',
  'terraform-infra': 'devops',
  'container-expert': 'devops',
  'cloud-devops-expert': 'devops',
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
  cpp: 'languages',
  'prioritize-python-3-10-features': 'languages',
  'comprehensive-type-annotations': 'languages',
  'jupyter-notebook-best-practices': 'languages',

  // Frameworks
  'react-expert': 'frameworks',
  'react-best-practices-vercel': 'frameworks',
  'nextjs-expert': 'frameworks',
  'svelte-expert': 'frameworks',
  'frontend-expert': 'frameworks',
  'graphql-expert': 'frameworks',
  'api-development-expert': 'frameworks',
  'state-management-expert': 'frameworks',

  // Mobile
  'react-native-skills-vercel': 'mobile',
  'ios-expert': 'mobile',
  'android-expert': 'mobile',
  'expo-mobile-app-rule': 'mobile',
  'expo-framework-rule': 'mobile',
  'mobile-first-design-rules': 'mobile',
  'mobile-ui-development-rule': 'mobile',

  // Database
  'database-architect': 'database',
  'database-expert': 'database',
  'data-expert': 'database',
  'text-to-sql': 'database',
  'pandas-data-manipulation-rules': 'database',

  // AI/ML
  'ai-ml-expert': 'ai-ml',

  // Documentation
  'doc-generator': 'documentation',
  'writing-skills': 'documentation',
  readme: 'documentation',

  // Creator
  'agent-creator': 'creator',
  'skill-creator': 'creator',
  'hook-creator': 'creator',
  'workflow-creator': 'creator',
  'template-creator': 'creator',
  'schema-creator': 'creator',
  'template-renderer': 'creator',
  'artifact-lifecycle': 'creator',

  // Requirements
  'spec-gathering': 'requirements',
  'interactive-requirements-gathering': 'requirements',

  // Specialized
  'thinking-tools': 'specialized',
  'sequential-thinking': 'specialized',
  'consensus-voting': 'specialized',
  'swarm-coordination': 'specialized',
  'task-management-protocol': 'specialized',
  'track-management': 'specialized',
  'workflow-patterns': 'specialized',
  'smart-debug': 'specialized',
  'summarize-changes': 'specialized',
  'insight-extraction': 'specialized',
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
  'visual-and-observational-rules': 'styling',
  accessibility: 'styling',
  // NOTE: mobile-ux-reviewer is an AGENT, not a skill (no SKILL.md exists) - removed SKL-002

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
  'architecture-review': 'Architecture',
  'diagram-generator': 'Architecture',
  'research-synthesis': 'Research',
  'arxiv-mcp': 'Research',
  'context-compressor': 'Memory',
  'session-handoff': 'Memory',
  'framework-context': 'Memory',
  'recommend-evolution': 'Memory',
  'verification-before-completion': 'Quality',
  'checklist-generator': 'Quality',
  'git-expert': 'Version Control',
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
  'spec-gathering': 'Requirements',
  'thinking-tools': 'Specialized',
  'sequential-thinking': 'Specialized',
  'swarm-coordination': 'Orchestration',
  'consensus-voting': 'Orchestration',
  'wave-executor': 'Orchestration',
  'web-design-guidelines-vercel': 'Styling',
  'styling-expert': 'Styling',
  'scientific-skills': 'Scientific',
  'modern-python': 'Languages',
  'poetry-rye-dependency-management': 'Languages',
  'pyqt6-ui-development-rules': 'Languages',
  'powershell-expert': 'Languages',
  'feature-flag-management': 'DevOps',
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
    'framework-context',
    'recommend-evolution',
    'plan-generator',
    'wave-executor',
    'complexity-assessment',
    'thinking-tools',
  ],
  'reflection-agent': ['framework-context', 'recommend-evolution'],
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
    'web-design-guidelines-vercel',
    'nextjs-expert',
  ],
  'master-orchestrator': ['swarm-coordination', 'consensus-voting', 'wave-executor'],
  'evolution-orchestrator': [
    'agent-creator',
    'command-creator',
    'rule-creator',
    'tool-creator',
    'hook-creator',
    'semgrep-rule-creator',
    'schema-creator',
    'skill-creator',
    'template-creator',
    'workflow-creator',
    'research-synthesis',
  ],
  'data-engineer': ['database-architect', 'ai-ml-expert', 'scientific-skills'],
  'ai-ml-specialist': ['ai-ml-expert', 'scientific-skills'],
  'python-pro': [
    'python-backend-expert',
    'modern-python',
    'poetry-rye-dependency-management',
    'pyqt6-ui-development-rules',
  ],
};

// Tool requirements for key skills
const SKILL_TOOLS = {
  tdd: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  debugging: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'code-quality-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'security-architect': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'auth-security-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'plan-generator': ['Read', 'Write'],
  'architecture-review': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  'diagram-generator': ['Read', 'Write', 'Edit', 'Bash'],
  'research-synthesis': ['WebSearch', 'WebFetch', 'Read', 'Write', 'Glob', 'Grep'],
  'context-compressor': ['Read', 'Write'],
  'session-handoff': ['Read', 'Write', 'Glob', 'Grep'],
  'framework-context': ['Read', 'Skill'],
  'recommend-evolution': ['Read', 'Write', 'Edit', 'Skill'],
  'verification-before-completion': ['Read', 'Bash'],
  'checklist-generator': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  'git-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
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
  'database-architect': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  'ai-ml-expert': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch'],
  'scientific-skills': ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  'swarm-coordination': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  'consensus-voting': ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  ripgrep: ['Bash'],
  'code-analyzer': ['Bash', 'Read', 'Glob', 'Grep'],
  'code-style-validator': ['Read', 'Grep', 'Bash', 'Glob'],
  'project-analyzer': ['Read', 'Bash', 'Glob', 'Grep'],
  'tool-search': ['Read', 'Glob', 'Grep'],
};

const SKILL_DESCRIPTION_MAP = {
  'framework-context':
    'Load and synthesize framework architecture context for reflection/planning.',
  'recommend-evolution':
    'Detect capability gaps and record standardized evolution recommendations.',
};

/**
 * Load agent-skill-matrix.json and build skill -> agents and agent -> skills maps.
 * Primary/always -> agentPrimary; secondary/contextual -> agentSupporting.
 * @returns {{ skillToAgents: Object.<string, { agentPrimary: string[], agentSupporting: string[] }>, agentToSkills: Object.<string, string[]> }}
 */

module.exports = {
  DOMAIN_MAP,
  CATEGORY_MAP,
  AGENT_SKILLS,
  SKILL_TOOLS,
  SKILL_DESCRIPTION_MAP,
};
