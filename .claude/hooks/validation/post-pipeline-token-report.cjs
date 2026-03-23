#!/usr/bin/env node
'use strict';

// PostToolUse hook: Auto-run ccusage when pipeline drains
// Triggers on TaskUpdate — when the last task completes, reports token usage
// Advisory hook — always exits 0, never blocks

const { execSync } = require('child_process');

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

    // Pipeline appears complete — run ccusage
    process.stderr.write('\n=== TOKEN USAGE REPORT (auto-triggered by post-pipeline hook) ===\n');
    try {
      const output = execSync('npx ccusage@latest --model --today 2>&1', {
        timeout: 30000,
        encoding: 'utf-8',
        shell: true,
        cwd: process.env.HOME || process.env.USERPROFILE || '.',
      });
      process.stderr.write(output + '\n');
    } catch (ccErr) {
      process.stderr.write('ccusage failed: ' + (ccErr.message || 'unknown error') + '\n');
    }
    process.stderr.write('=== END TOKEN USAGE REPORT ===\n');
  } catch (_e) {
    // Advisory hook — fail open
  }
  process.exit(0);
});
