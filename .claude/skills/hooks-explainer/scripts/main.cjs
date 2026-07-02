#!/usr/bin/env node
'use strict';

const path = require('path');

const TOPIC_MAP = {
  overview: {
    summary:
      'Claude hook enforcement runs before and after tool use to protect routed workflows, guarded paths, and completion contracts.',
    components: [
      '.claude/docs/@ENFORCEMENT_HOOKS.md',
      '.claude/docs/HOOKS_REFERENCE.md',
      '.claude/hooks/README.md',
    ],
    failureModes: [
      'Protected-path writes are blocked by routing and creator guard hooks.',
      'Completion can be rejected when verification evidence is missing.',
      'Repeated polling or stale task loops are blocked by unified pre-tool guardrails.',
    ],
  },
  protected_paths: {
    summary:
      'Protected paths are intentionally guarded so agents do not modify hooks, skills, or other creator-governed assets without following the right workflow.',
    components: [
      '.claude/docs/@ENFORCEMENT_HOOKS.md',
      '.claude/hooks/routing/pre-tool-unified.cjs',
      '.claude/hooks/routing/routing-guard.cjs',
    ],
    failureModes: [
      'Direct writes into .claude/hooks or other creator-owned surfaces are blocked.',
      'Unsafe Bash or tool usage is rejected before execution.',
    ],
  },
  bypasses: {
    summary:
      'Safe bypasses are process changes, not security holes: use the documented creator workflow, required validations, and explicit human approval when governance requires it.',
    components: [
      '.claude/docs/@ENFORCEMENT_HOOKS.md',
      '.claude/docs/RELEASE_GOVERNANCE.md',
      '.claude/hooks/README.md',
    ],
    failureModes: [
      'Trying to bypass protected paths with direct edits triggers creator guard failures.',
      'Skipping required validation or governance evidence causes completion rejection.',
    ],
  },
  taskupdate: {
    summary:
      'Task completion is gated by hook checks that expect verification evidence and structured completion metadata.',
    components: [
      '.claude/hooks/validation/pre-completion-validation.cjs',
      '.claude/docs/DEVELOPER_WORKFLOW.md',
      '.claude/docs/RELEASE_GOVERNANCE.md',
    ],
    failureModes: [
      'Missing verification commands or evidence blocks completed TaskUpdate.',
      'Malformed completion payloads trigger validation errors.',
    ],
  },
};

function parseArgs(argv) {
  const args = {
    format: 'markdown',
    topic: 'overview',
    projectRoot: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json') {
      args.format = 'json';
    } else if (arg === '--markdown') {
      args.format = 'markdown';
    } else if (arg.startsWith('--topic=')) {
      args.topic = arg.slice('--topic='.length);
    } else if (arg === '--topic' && argv[i + 1]) {
      args.topic = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--project-root=')) {
      args.projectRoot = arg.slice('--project-root='.length);
    } else if (arg === '--project-root' && argv[i + 1]) {
      args.projectRoot = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function buildExplanation(topicKey, projectRoot) {
  const normalizedTopic = String(topicKey || 'overview')
    .trim()
    .toLowerCase();
  const topic = TOPIC_MAP[normalizedTopic] || TOPIC_MAP.overview;
  const resolvedTopic = TOPIC_MAP[normalizedTopic] ? normalizedTopic : 'overview';

  return {
    topic: resolvedTopic,
    summary: topic.summary,
    components: topic.components.map(component => ({
      path: component,
      absolutePath: path.resolve(projectRoot, component),
    })),
    failureModes: topic.failureModes,
    nextSteps: [
      'Read the referenced docs before changing guarded files.',
      'Use the documented workflow instead of direct protected-path edits.',
      'Collect verification evidence before completed TaskUpdate.',
    ],
  };
}

function renderMarkdown(explanation) {
  const lines = [];
  lines.push('# Hooks Explainer');
  lines.push('');
  lines.push(`Topic: ${explanation.topic}`);
  lines.push('');
  lines.push(explanation.summary);
  lines.push('');
  lines.push('## Key References');
  for (const component of explanation.components) {
    lines.push(`- ${component.path}`);
  }
  lines.push('');
  lines.push('## Common Failure Modes');
  for (const failure of explanation.failureModes) {
    lines.push(`- ${failure}`);
  }
  lines.push('');
  lines.push('## Recommended Next Steps');
  for (const step of explanation.nextSteps) {
    lines.push(`- ${step}`);
  }
  return lines.join('\n');
}

function printHelp() {
  console.log('hooks-explainer');
  console.log('');
  console.log('Usage: node .claude/skills/hooks-explainer/scripts/main.cjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --topic <overview|protected_paths|bypasses|taskupdate>');
  console.log('  --json');
  console.log('  --markdown');
  console.log('  --project-root <path>');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const explanation = buildExplanation(args.topic, args.projectRoot);
  if (args.format === 'json') {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  console.log(renderMarkdown(explanation));
}

main();
