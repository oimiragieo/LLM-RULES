#!/usr/bin/env node
'use strict';

// PostToolUse hook: Auto-trigger milestone self-review when pipeline drains
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    const toolName = data?.tool_name || data?.tool || '';
    if (!toolName.includes('TaskUpdate')) {
      process.exit(0);
    }

    const params = data?.tool_input || data?.input || {};
    if (params.status !== 'completed') {
      process.exit(0);
    }

    // Detect pipeline-final task
    const subject = (params.subject || '').toLowerCase();
    const metadata = params.metadata || {};
    const isFinalTask =
      subject.includes('final') ||
      subject.includes('deliverable') ||
      subject.includes('report') ||
      metadata.pipelineComplete === true ||
      metadata.isFinalTask === true;

    if (!isFinalTask) {
      process.exit(0);
    }

    // Queue a milestone self-review reflection
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      process.exit(0);
    }

    const spawnFile = path.join(
      projectRoot,
      '.claude',
      'context',
      'runtime',
      'reflection-spawn-request.json'
    );
    const reminderFile = path.join(
      projectRoot,
      '.claude',
      'context',
      'runtime',
      'reflection-reminder.txt'
    );

    // Read existing spawn requests
    let requests = [];
    try {
      const content = fs.readFileSync(spawnFile, 'utf-8');
      requests = JSON.parse(content);
      if (!Array.isArray(requests)) requests = [];
    } catch {
      requests = [];
    }

    const id = `reflection-milestone-self-review-${Date.now()}`;

    requests.push({
      id,
      status: 'pending',
      subagent_type: 'reflection-agent',
      description: 'Milestone self-review: Can I improve this?',
      prompt: [
        'You are the REFLECTION-AGENT.',
        '',
        'Trigger: milestone-self-review',
        `Timestamp: ${new Date().toISOString()}`,
        'Priority: high',
        '',
        'A pipeline just completed. Perform a milestone self-review:',
        '1. Review all completed tasks in this session',
        '2. Ask: "Can I improve this?" for each major deliverable',
        '3. If YES to any, create actionable improvement items',
        '4. NEVER dismiss failures as "pre-existing"',
        '5. Log findings to learnings.md and issues.md',
        '',
        `ATOMIC COMPLETION: TaskUpdate({ taskId: "${id}", status: "completed", metadata: { processedReflectionIds: ["${id}"] } })`,
      ].join('\n'),
      source: {
        trigger: 'milestone-self-review',
        timestamp: new Date().toISOString(),
        priority: 'high',
      },
    });

    fs.writeFileSync(spawnFile, JSON.stringify(requests, null, 2));

    // Write reminder
    const reminderCount = requests.filter(r => r.status === 'pending' || !r.status).length;
    fs.writeFileSync(
      reminderFile,
      `STEP 0: You have ${reminderCount} pending reflection spawn request(s) including a MILESTONE SELF-REVIEW. Read .claude/context/runtime/reflection-spawn-request.json and spawn reflection-agent for each request. After spawning, clear/trim the spawn request file and delete this reminder. Then announce "Step 0 complete" before TaskList().\n`
    );

    process.stderr.write(
      `[post-pipeline-self-review] Queued milestone self-review reflection: ${id}\n`
    );
  } catch {
    // Advisory hook — fail open
  }
  process.exit(0);
});

function findProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
