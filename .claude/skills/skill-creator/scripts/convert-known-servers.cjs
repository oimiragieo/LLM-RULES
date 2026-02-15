'use strict';

const KNOWN_SERVERS = {
  npm: {
    '@modelcontextprotocol/server-filesystem': {
      description: 'File system operations - read, write, search files',
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      env: [],
    },
    '@modelcontextprotocol/server-memory': {
      description: 'Knowledge graph memory for persistent context',
      tools: ['Read', 'Write'],
      env: [],
    },
    '@modelcontextprotocol/server-github': {
      description: 'GitHub API integration - repos, issues, PRs',
      tools: ['Bash', 'WebFetch'],
      env: ['GITHUB_TOKEN'],
    },
    '@modelcontextprotocol/server-slack': {
      description: 'Slack messaging and channel management',
      tools: ['WebFetch'],
      env: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    },
    '@modelcontextprotocol/server-postgres': {
      description: 'PostgreSQL database operations',
      tools: ['Bash'],
      env: ['DATABASE_URL'],
    },
    '@modelcontextprotocol/server-sqlite': {
      description: 'SQLite database operations',
      tools: ['Bash', 'Read'],
      env: [],
    },
    '@modelcontextprotocol/server-puppeteer': {
      description: 'Browser automation with Puppeteer',
      tools: ['Bash', 'Write'],
      env: [],
    },
    '@modelcontextprotocol/server-brave-search': {
      description: 'Brave Search API integration',
      tools: ['WebSearch', 'WebFetch'],
      env: ['BRAVE_API_KEY'],
    },
    '@anthropic/mcp-shell': {
      description: 'Shell command execution with safety controls',
      tools: ['Bash'],
      env: [],
    },
  },
  pypi: {
    'mcp-server-git': {
      description: 'Git operations - clone, commit, branch, merge',
      tools: ['Bash', 'Read', 'Write'],
      env: [],
    },
    'mcp-server-time': {
      description: 'Time and timezone utilities',
      tools: [],
      env: [],
    },
    'mcp-server-sentry': {
      description: 'Sentry error tracking integration',
      tools: ['WebFetch'],
      env: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
    },
    'mcp-server-fetch': {
      description: 'HTTP fetch operations',
      tools: ['WebFetch'],
      env: [],
    },
  },
  docker: {
    'mcp/github': {
      description: 'Official GitHub MCP server',
      tools: ['Bash', 'WebFetch'],
      env: ['GITHUB_TOKEN'],
    },
    'mcp/playwright': {
      description: 'Browser automation with Playwright',
      tools: ['Bash', 'Write'],
      env: [],
    },
    'mcp/postgres': {
      description: 'PostgreSQL database server',
      tools: ['Bash'],
      env: ['DATABASE_URL'],
    },
  },
};

module.exports = {
  KNOWN_SERVERS,
};
