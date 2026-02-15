'use strict';

const path = require('path');
const fs = require('fs');

const mockRegistry = {
  version: '1.0.0',
  generatedAt: '2026-01-31T12:00:00.000Z',
  metadata: {
    totalAgents: 6,
    healthyAgents: 5,
    degradedAgents: 1,
    unavailableAgents: 0,
    lastHealthCheck: '2026-01-31T12:00:00.000Z',
    lastFullScan: '2026-01-31T12:00:00.000Z',
  },
  agents: {
    developer: {
      id: 'developer',
      displayName: 'Developer Agent',
      category: 'core',
      filePath: '.claude/agents/core/developer.md',
      capabilities: [
        {
          name: 'implementation',
          domain: 'code',
          description: 'TDD-focused code implementation',
          triggerPhrases: ['implement', 'code', 'develop'],
          requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
          skills: ['tdd', 'debugging'],
        },
        {
          name: 'bug-fix',
          domain: 'code',
          description: 'Fix bugs using systematic debugging',
          triggerPhrases: ['fix bug', 'debug'],
          requiredTools: ['Read', 'Write', 'Edit'],
          skills: ['debugging', 'tdd'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 50,
        failureCount: 2,
        successRate: 0.96,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.1.0',
      },
    },
    'code-reviewer': {
      id: 'code-reviewer',
      displayName: 'Code Reviewer',
      category: 'specialized',
      filePath: '.claude/agents/specialized/code-reviewer.md',
      capabilities: [
        {
          name: 'code-review',
          domain: 'code',
          description: 'Read-only code analysis and review',
          triggerPhrases: ['review code', 'PR review'],
          requiredTools: ['Read', 'Grep', 'Glob'],
          skills: ['code-reviewer'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 10,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 100,
        failureCount: 0,
        successRate: 1.0,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    qa: {
      id: 'qa',
      displayName: 'QA Agent',
      category: 'core',
      filePath: '.claude/agents/core/qa.md',
      capabilities: [
        {
          name: 'testing',
          domain: 'testing',
          description: 'Comprehensive testing and validation',
          triggerPhrases: ['test', 'qa', 'validate'],
          requiredTools: ['Read', 'Write', 'Bash'],
          skills: ['tdd', 'qa-workflow'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 75,
        failureCount: 5,
        successRate: 0.94,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'security-architect': {
      id: 'security-architect',
      displayName: 'Security Architect',
      category: 'specialized',
      filePath: '.claude/agents/specialized/security-architect.md',
      capabilities: [
        {
          name: 'security-review',
          domain: 'security',
          description: 'Security analysis and threat modeling',
          triggerPhrases: ['security', 'threat', 'owasp'],
          requiredTools: ['Read', 'Grep'],
          skills: ['security-architect'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 3,
        preferredModel: 'opus',
      },
      health: {
        status: 'degraded',
        consecutiveFailures: 1,
        successCount: 20,
        failureCount: 8,
        successRate: 0.71,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'frontend-pro': {
      id: 'frontend-pro',
      displayName: 'Frontend Pro',
      category: 'domain',
      filePath: '.claude/agents/domain/frontend-pro.md',
      capabilities: [
        {
          name: 'implementation',
          domain: 'frontend',
          description: 'React/Vue/Angular implementation',
          triggerPhrases: ['react', 'vue', 'frontend'],
          requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
          skills: ['frontend-pro'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 30,
        failureCount: 1,
        successRate: 0.97,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'master-orchestrator': {
      id: 'master-orchestrator',
      displayName: 'Master Orchestrator',
      category: 'orchestrator',
      filePath: '.claude/agents/orchestrators/master-orchestrator.md',
      capabilities: [
        {
          name: 'orchestration',
          domain: 'orchestration',
          description: 'Coordinate multi-agent workflows',
          triggerPhrases: ['orchestrate', 'coordinate'],
          requiredTools: ['Read', 'Write', 'Task'],
          skills: ['swarm-coordination'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 1,
        preferredModel: 'opus',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 15,
        failureCount: 0,
        successRate: 1.0,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
  },
  index: {
    byCapability: {
      implementation: ['developer', 'frontend-pro'],
      'bug-fix': ['developer'],
      'code-review': ['code-reviewer'],
      testing: ['qa'],
      'security-review': ['security-architect'],
      orchestration: ['master-orchestrator'],
    },
    byDomain: {
      code: ['developer', 'code-reviewer'],
      testing: ['qa'],
      security: ['security-architect'],
      frontend: ['frontend-pro'],
      orchestration: ['master-orchestrator'],
    },
    byCategory: {
      core: ['developer', 'qa'],
      specialized: ['code-reviewer', 'security-architect'],
      domain: ['frontend-pro'],
      orchestrator: ['master-orchestrator'],
    },
  },
  health: {
    healthy: ['developer', 'code-reviewer', 'qa', 'frontend-pro', 'master-orchestrator'],
    degraded: ['security-architect'],
    unavailable: [],
  },
};

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
const FIXTURE_PATH = path.join(FIXTURE_DIR, 'test-agent-registry.json');

function ensureFixtureRegistry() {
  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  }
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(mockRegistry, null, 2));
}

function cleanupFixtureRegistry() {
  if (fs.existsSync(FIXTURE_PATH)) {
    fs.unlinkSync(FIXTURE_PATH);
  }
}

module.exports = {
  mockRegistry,
  FIXTURE_DIR,
  FIXTURE_PATH,
  ensureFixtureRegistry,
  cleanupFixtureRegistry,
};
