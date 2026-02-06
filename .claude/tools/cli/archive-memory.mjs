#!/usr/bin/env node

/**
 * Memory Archiving Tool
 * Archives old ADRs and resolved issues from decisions.md and issues.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude/context/memory');
const ARCHIVE_DIR = path.join(MEMORY_DIR, 'archive');

// Ensure archive directory exists
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

/**
 * Archive resolved issues from issues.md
 */
function archiveResolvedIssues() {
  const issuesPath = path.join(MEMORY_DIR, 'issues.md');
  const archivePath = path.join(ARCHIVE_DIR, 'issues-resolved-2026-02.md');

  const content = fs.readFileSync(issuesPath, 'utf8');
  const lines = content.split('\n');

  const resolvedBlocks = [];
  const activeBlocks = [];

  let currentBlock = [];
  let isResolved = false;
  let inHeader = true;
  const headerLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect header section (before first issue)
    if (inHeader && line.match(/^## \[/)) {
      inHeader = false;
    }

    if (inHeader) {
      headerLines.push(line);
      continue;
    }

    // Detect new issue block
    if (line.match(/^## \[/)) {
      // Save previous block
      if (currentBlock.length > 0) {
        if (isResolved) {
          resolvedBlocks.push(currentBlock.join('\n'));
        } else {
          activeBlocks.push(currentBlock.join('\n'));
        }
      }

      // Start new block
      currentBlock = [line];
      isResolved = false;
    } else if (line.match(/Status\*\*:\s*RESOLVED/) || line.match(/Status\*\*:\s*Resolved/)) {
      isResolved = true;
      currentBlock.push(line);
    } else {
      currentBlock.push(line);
    }
  }

  // Save last block
  if (currentBlock.length > 0) {
    if (isResolved) {
      resolvedBlocks.push(currentBlock.join('\n'));
    } else {
      activeBlocks.push(currentBlock.join('\n'));
    }
  }

  console.log(`Found ${resolvedBlocks.length} RESOLVED issues to archive`);
  console.log(`Keeping ${activeBlocks.length} active issues`);

  // Write archive file
  const archiveContent = `# Resolved Issues (Archived 2026-02-04)

This file contains resolved issues archived from issues.md to reduce file size.

---

${resolvedBlocks.join('\n\n---\n\n')}
`;

  fs.writeFileSync(archivePath, archiveContent, 'utf8');

  // Write updated issues.md
  const newIssuesContent = `${headerLines.join('\n')}

<!-- OPEN ISSUES BELOW THIS LINE -->

${activeBlocks.join('\n\n---\n\n')}
`;

  fs.writeFileSync(issuesPath, newIssuesContent, 'utf8');

  return { archived: resolvedBlocks.length, remaining: activeBlocks.length };
}

/**
 * Archive old ADRs from decisions.md (keep last 20)
 */
function archiveOldDecisions() {
  const decisionsPath = path.join(MEMORY_DIR, 'decisions.md');
  const archivePath = path.join(ARCHIVE_DIR, 'decisions-2026-02.md');

  const content = fs.readFileSync(decisionsPath, 'utf8');
  const lines = content.split('\n');

  const adrBlocks = [];
  let currentBlock = [];
  let inHeader = true;
  const headerLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect header section
    if (inHeader && line.match(/^## \[ADR-\d+\]/)) {
      inHeader = false;
    }

    if (inHeader) {
      headerLines.push(line);
      continue;
    }

    // Detect new ADR block
    if (line.match(/^## \[ADR-\d+\]/)) {
      if (currentBlock.length > 0) {
        adrBlocks.push(currentBlock.join('\n'));
      }
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }

  // Save last block
  if (currentBlock.length > 0) {
    adrBlocks.push(currentBlock.join('\n'));
  }

  console.log(`Found ${adrBlocks.length} total ADRs`);

  // Keep last 5 ADRs, archive the rest
  const keepCount = Math.min(5, adrBlocks.length);
  const archiveCount = Math.max(0, adrBlocks.length - 5);

  const toKeep = adrBlocks.slice(-keepCount);
  const toArchive = adrBlocks.slice(0, archiveCount);

  console.log(`Archiving ${archiveCount} ADRs, keeping ${keepCount} ADRs`);

  if (toArchive.length > 0) {
    // Write archive file
    const archiveContent = `# Archived Architecture Decision Records (2026-02-04)

This file contains ADRs archived from decisions.md to reduce file size.

---

${toArchive.join('\n\n---\n\n')}
`;

    fs.writeFileSync(archivePath, archiveContent, 'utf8');
  }

  // Write updated decisions.md
  const newDecisionsContent = `${headerLines.join('\n')}

---

${toKeep.join('\n\n---\n\n')}
`;

  fs.writeFileSync(decisionsPath, newDecisionsContent, 'utf8');

  return { archived: archiveCount, remaining: keepCount };
}

/**
 * Main execution
 */
function main() {
  console.log('=== Memory Archiving Tool ===\n');

  console.log('1. Archiving resolved issues...');
  const issueStats = archiveResolvedIssues();

  console.log('\n2. Archiving old ADRs...');
  const decisionStats = archiveOldDecisions();

  console.log('\n=== Archiving Complete ===');
  console.log(`\nIssues: ${issueStats.archived} archived, ${issueStats.remaining} remaining`);
  console.log(
    `Decisions: ${decisionStats.archived} archived, ${decisionStats.remaining} remaining`
  );

  // Get new file sizes
  const issuesSize = fs.statSync(path.join(MEMORY_DIR, 'issues.md')).size;
  const decisionsSize = fs.statSync(path.join(MEMORY_DIR, 'decisions.md')).size;

  console.log(`\nNew file sizes:`);
  console.log(`  issues.md: ${(issuesSize / 1024).toFixed(2)} KB`);
  console.log(`  decisions.md: ${(decisionsSize / 1024).toFixed(2)} KB`);
}

main();
