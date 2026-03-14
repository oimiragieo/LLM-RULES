import fs from 'fs';
import { globSync } from 'glob';

const agentFiles = globSync('.claude/agents/**/*.md');

let modifiedCount = 0;

for (const file of agentFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  const original = content;

  // 1. Strip static file injections from YAML frontmatter
  // Removes lines like: `  - '@.claude/context/memory/learnings.md'`
  content = content.replace(/^\s*-\s*['"]?@?\.claude\/context\/memory\/.*\.md['"]?\s*\r?\n/gm, '');

  // 2. Eradicate empty context_files arrays to prevent parser errors
  content = content.replace(/^context_files:\s*\r?\n(?!(?:\s*-|\w))/gm, '');

  // 3. Rewrite the Memory Protocol instructions natively
  // Replace `cat .claude/context/memory/...` instructions with memory-search
  const oldMemoryProtocolPattern1 = /cat \.claude\/context\/memory\/learnings\.md/g;
  const oldMemoryProtocolPattern2 = /cat \.claude\/context\/memory\/decisions\.md/g;
  const oldMemoryProtocolPattern3 = /cat \.claude\/context\/memory\/issues\.md/g;

  content = content.replace(
    oldMemoryProtocolPattern1,
    'node .claude/lib/memory/memory-search.cjs "<task-domain-keywords>"'
  );
  content = content.replace(oldMemoryProtocolPattern2, '');
  content = content.replace(oldMemoryProtocolPattern3, '');

  // Cleanup potential blank bash instruction lines
  content = content.replace(/```bash\s*\r?\n\s*\r?\n```/gm, '```bash\n```');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    modifiedCount++;
    console.log(`Stripped static memory context from ${file}`);
  }
}

console.log(
  `\nSuccessfully finalized Zero-Bloat Memory Migration across ${modifiedCount} agent templates.`
);
