#!/usr/bin/env node
'use strict';

// PostToolUse hook: Report token usage when pipeline drains
// Triggers on TaskUpdate — when the last task completes, reads ccusage-status.txt
// Advisory hook — always exits 0, never blocks

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Only fire on TaskUpdate completions
    const toolName = data?.tool_name || data?.tool || '';
    if (!toolName.includes('TaskUpdate')) {
      process.exit(0);
    }

    // Check if this is a completion
    const params = data?.tool_input || data?.input || {};
    if (params.status !== 'completed') {
      process.exit(0);
    }

    // Check for pipeline-final signals in subject or metadata
    const subject = (params.subject || '').toLowerCase();
    const metadata = params.metadata || {};
    const summary = (metadata.summary || '').toLowerCase();
    const isFinalTask =
      subject.includes('final') ||
      subject.includes('deliverable') ||
      subject.includes('pipeline') ||
      summary.includes('final') ||
      summary.includes('deliverable') ||
      summary.includes('pipeline complete') ||
      metadata.pipelineComplete === true ||
      metadata.isFinalTask === true;

    if (!isFinalTask) {
      process.exit(0);
    }

    // Pipeline appears complete — read ccusage-status.txt (written by ccusage-statusline.cjs hook)
    process.stderr.write('\n=== TOKEN USAGE REPORT (auto-triggered by post-pipeline hook) ===\n');
    try {
      const statusPath = path.join(
        process.cwd(),
        '.claude',
        'context',
        'runtime',
        'ccusage-status.txt'
      );
      if (fs.existsSync(statusPath)) {
        const status = fs.readFileSync(statusPath, 'utf8').trim();
        process.stderr.write(status + '\n');
      } else {
        process.stderr.write(
          'ccusage-status.txt not found (ccusage-statusline hook may not have fired)\n'
        );
      }
    } catch (readErr) {
      process.stderr.write(
        'Failed to read ccusage-status.txt: ' + (readErr.message || 'unknown error') + '\n'
      );
    }
    process.stderr.write('=== END TOKEN USAGE REPORT ===\n');
  } catch (_e) {
    // Advisory hook — fail open
  }
  process.exit(0);
});
