'use strict';

const CORE_TOOLS = [
  {
    name: 'Read',
    category: 'File I/O',
    description: 'Read files from filesystem',
    mandatory: false,
  },
  { name: 'Write', category: 'File I/O', description: 'Create/overwrite files', mandatory: false },
  {
    name: 'Edit',
    category: 'File I/O',
    description: 'Make precise edits to files',
    mandatory: false,
  },
  { name: 'Bash', category: 'Shell', description: 'Execute shell commands', mandatory: false },
  {
    name: 'Glob',
    category: 'Search',
    description: 'Pattern-based file discovery',
    mandatory: false,
  },
  { name: 'Grep', category: 'Search', description: 'Content search in files', mandatory: false },
  { name: 'Task', category: 'Orchestration', description: 'Spawn subagents', mandatory: false },
  {
    name: 'Orchestrator',
    category: 'Orchestration',
    description: 'Delegate task to agent pipeline',
    mandatory: false,
  },
  {
    name: 'TaskCreate',
    category: 'Task Management',
    description: 'Create trackable tasks',
    mandatory: false,
  },
  {
    name: 'TaskUpdate',
    category: 'Task Management',
    description: 'Update task status/metadata',
    mandatory: true,
  },
  {
    name: 'TaskList',
    category: 'Task Management',
    description: 'List all tasks',
    mandatory: false,
  },
  {
    name: 'TaskGet',
    category: 'Task Management',
    description: 'Get task details',
    mandatory: false,
  },
  {
    name: 'TaskOutput',
    category: 'Task Management',
    description: 'Read task output',
    mandatory: false,
  },
  {
    name: 'TaskStop',
    category: 'Task Management',
    description: 'Stop running task',
    mandatory: false,
  },
  { name: 'Skill', category: 'Capability', description: 'Invoke skill workflows', mandatory: true },
  {
    name: 'AskUserQuestion',
    category: 'Interaction',
    description: 'Get user input',
    mandatory: false,
  },
  {
    name: 'EnterPlanMode',
    category: 'Planning',
    description: 'Switch to planning mode',
    mandatory: false,
  },
  {
    name: 'ExitPlanMode',
    category: 'Planning',
    description: 'Exit planning mode',
    mandatory: false,
  },
  { name: 'WebSearch', category: 'Research', description: 'Search the web', mandatory: false },
  {
    name: 'WebFetch',
    category: 'Research',
    description: 'Fetch webpage content',
    mandatory: false,
  },
  {
    name: 'NotebookEdit',
    category: 'Jupyter',
    description: 'Edit notebook cells',
    mandatory: false,
  },
  {
    name: 'MemoryRecord',
    category: 'Memory',
    description: 'Record structured memory entries',
    mandatory: false,
  },
];

const EDITING_TOOLS = new Set(['Write', 'Edit', 'Bash', 'NotebookEdit', 'TaskStop']);
const OPTIONAL_TOOLS = new Set(['EnterPlanMode', 'ExitPlanMode']);
const NO_PROJECT_TOOLS = new Set([
  'Task',
  'TaskList',
  'TaskCreate',
  'AskUserQuestion',
  'WebSearch',
  'WebFetch',
]);

// MCP tools definition (from CLAUDE.md Section 1.4)
const MCP_TOOLS = [
  {
    name: 'mcp__chrome-devtools__*',
    server: 'chrome-devtools',
    description: 'Browser automation via Chrome DevTools Protocol',
    fallback: "Skill({ skill: 'chrome-browser' })",
    fallbackTools: ['Read', 'Write', 'WebFetch'],
  },
  {
    name: 'mcp__sequential-thinking__sequentialthinking',
    server: 'sequential-thinking',
    description: 'Structured thinking and analysis',
    fallback: "Skill({ skill: 'sequential-thinking' })",
    fallbackTools: ['Read', 'Write', 'Bash'],
  },
  {
    name: 'mcp__Ref__ref_search_documentation',
    server: 'Ref',
    description: 'Documentation search',
    fallback: 'WebSearch + WebFetch',
    fallbackTools: ['WebSearch', 'WebFetch'],
  },
  {
    name: 'mcp__Ref__ref_read_url',
    server: 'Ref',
    description: 'Read URL content via Ref',
    fallback: 'WebFetch',
    fallbackTools: ['WebFetch'],
  },
  {
    name: 'mcp__Exa__web_search_exa',
    server: 'Exa',
    description: 'Enhanced web search via Exa',
    fallback: 'WebSearch',
    fallbackTools: ['WebSearch'],
  },
  {
    name: 'mcp__Exa__get_code_context_exa',
    server: 'Exa',
    description: 'Code context search via Exa',
    fallback: 'Grep + Glob',
    fallbackTools: ['Grep', 'Glob'],
  },
  {
    name: 'mcp__Exa__company_research_exa',
    server: 'Exa',
    description: 'Company research via Exa',
    fallback: 'WebSearch',
    fallbackTools: ['WebSearch'],
  },
  {
    name: 'mcp__shadcn__getComponents',
    server: 'shadcn',
    description: 'Get shadcn/ui components list',
    fallback: "WebFetch('https://ui.shadcn.com/...')",
    fallbackTools: ['WebFetch'],
  },
  {
    name: 'mcp__shadcn__getComponent',
    server: 'shadcn',
    description: 'Get specific shadcn/ui component',
    fallback: "WebFetch('https://ui.shadcn.com/...')",
    fallbackTools: ['WebFetch'],
  },
];

// Toolset definitions (from CLAUDE.md Section 1.4)
// NOTE: `tools.toolsets` in the manifest must map toolset names to arrays of tool names
// (see `.claude/schemas/tool-manifest.schema.json`). Keep richer metadata here and
// derive the schema-shape mapping below.
const TOOLSET_DEFINITIONS = {
  CORE_TOOLS: {
    description: 'All 20 core tools built into Claude Code',
    tools: CORE_TOOLS.map(t => t.name),
  },
  DEVELOPER: {
    description: 'Standard development agent toolset',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
      'MemoryRecord',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  PLANNER: {
    description: 'Planning agent toolset with planning mode',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
      'MemoryRecord',
      'EnterPlanMode',
      'ExitPlanMode',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  ORCHESTRATOR: {
    description: 'Agent orchestration toolset (can spawn subagents)',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'Task',
      'Orchestrator',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
      'MemoryRecord',
    ],
    mandatory: ['Task', 'TaskUpdate', 'Skill'],
  },
  ROUTER: {
    description: 'Router-only toolset (restricted)',
    tools: ['Read', 'Task', 'TaskList', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'AskUserQuestion'],
    mandatory: ['Task', 'TaskList'],
  },
  RESEARCHER: {
    description: 'Research agent toolset with web access',
    tools: [
      'Read',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'Skill',
      'MemoryRecord',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  READ_ONLY: {
    description: 'Read-only agent toolset (e.g., code-reviewer)',
    tools: ['Read', 'Glob', 'Grep', 'TaskUpdate', 'TaskList', 'Skill', 'MemoryRecord'],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  DATA_SCIENCE: {
    description: 'Data science and ML toolset with Jupyter support',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'NotebookEdit',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'Skill',
      'MemoryRecord',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
};

const TOOLSETS = Object.fromEntries(
  Object.entries(TOOLSET_DEFINITIONS).map(([name, def]) => [name, def.tools])
);

// Agent defaults (from CLAUDE.md Section 1.4)
const AGENT_DEFAULTS = {
  developer: { toolset: 'DEVELOPER', maxTools: 12 },
  qa: { toolset: 'DEVELOPER', maxTools: 12 },
  planner: { toolset: 'PLANNER', maxTools: 14 },
  architect: { toolset: 'PLANNER', maxTools: 14 },
  'security-architect': { toolset: 'DEVELOPER', maxTools: 12 },
  'technical-writer': { toolset: 'DEVELOPER', maxTools: 12 },
  devops: { toolset: 'DEVELOPER', maxTools: 12 },
  'code-reviewer': { toolset: 'READ_ONLY', maxTools: 6 },
  researcher: { toolset: 'RESEARCHER', maxTools: 10 },
  'master-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'swarm-coordinator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'evolution-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'party-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'context-compressor': { toolset: 'DEVELOPER', maxTools: 5 },
  'data-engineer': { toolset: 'DATA_SCIENCE', maxTools: 12 },
  'ai-ml-specialist': { toolset: 'DATA_SCIENCE', maxTools: 12 },
};

/**
 * Check MCP server configuration
 */

module.exports = {
  CORE_TOOLS,
  EDITING_TOOLS,
  OPTIONAL_TOOLS,
  NO_PROJECT_TOOLS,
  MCP_TOOLS,
  TOOLSET_DEFINITIONS,
  TOOLSETS,
  AGENT_DEFAULTS,
};
