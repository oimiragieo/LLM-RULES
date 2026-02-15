#!/usr/bin/env node
/**
 * Skill Consolidation Tool
 *
 * Consolidates granular skills into domain-based expert skills
 * to reduce context overhead and simplify router selection.
 */

const fs = require('fs');
const path = require('path');
const { DOMAIN_BUCKETS, PROTECTED_SKILLS } = require('./consolidate-config.cjs');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

/**
 * Get all skill directories
 */
function getAllSkills() {
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => !PROTECTED_SKILLS.includes(name));
}

/**
 * Read a skill's content
 */
function readSkillContent(skillName) {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

/**
 * Extract instructions/guidelines from a skill
 */
function extractGuidelines(content) {
  // Try to extract <instructions> block
  const instructionsMatch = content.match(/<instructions>([\s\S]*?)<\/instructions>/);
  if (instructionsMatch) return instructionsMatch[1].trim();

  // Try to extract after frontmatter
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  if (bodyMatch) {
    // Remove Memory Protocol section
    let body = bodyMatch[1];
    body = body.replace(/## Memory Protocol[\s\S]*$/m, '').trim();
    return body;
  }

  return content;
}

/**
 * Match skills to buckets
 */
function matchSkillsToBuckets() {
  const skills = getAllSkills();
  const bucketAssignments = {};
  const unassigned = [];

  // Initialize buckets
  for (const bucket of Object.keys(DOMAIN_BUCKETS)) {
    bucketAssignments[bucket] = [];
  }

  // Match each skill to a bucket
  for (const skill of skills) {
    let matched = false;
    for (const [bucket, config] of Object.entries(DOMAIN_BUCKETS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(skill)) {
          bucketAssignments[bucket].push(skill);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      unassigned.push(skill);
    }
  }

  return { bucketAssignments, unassigned };
}

/**
 * Analyze buckets and show what would be consolidated
 */
function analyzeBuckets() {
  const { bucketAssignments, unassigned } = matchSkillsToBuckets();

  console.log('\n📊 SKILL CONSOLIDATION ANALYSIS\n');
  console.log('='.repeat(60) + '\n');

  let totalToConsolidate = 0;
  const activeBuckets = [];

  for (const [bucket, skills] of Object.entries(bucketAssignments)) {
    if (skills.length > 0) {
      activeBuckets.push({ bucket, skills, config: DOMAIN_BUCKETS[bucket] });
      totalToConsolidate += skills.length;
    }
  }

  // Sort by count descending
  activeBuckets.sort((a, b) => b.skills.length - a.skills.length);

  for (const { bucket, skills, config } of activeBuckets) {
    console.log(`📦 ${bucket} (${skills.length} skills)`);
    console.log(`   ${config.description}`);
    if (options.verbose) {
      skills.slice(0, 10).forEach(s => console.log(`     - ${s}`));
      if (skills.length > 10) console.log(`     ... and ${skills.length - 10} more`);
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total skills to consolidate: ${totalToConsolidate}`);
  console.log(`   Will create: ${activeBuckets.length} expert skills`);
  console.log(`   Unassigned skills: ${unassigned.length}`);

  if (options.verbose && unassigned.length > 0) {
    console.log('\n⚠️  Unassigned skills (will remain as-is):');
    unassigned.slice(0, 20).forEach(s => console.log(`   - ${s}`));
    if (unassigned.length > 20) console.log(`   ... and ${unassigned.length - 20} more`);
  }

  console.log('\n💡 Run with --execute to perform consolidation');
  console.log('   Run with --verbose to see all skills');

  return { bucketAssignments, unassigned, activeBuckets };
}

/**
 * Generate consolidated skill content
 */
function generateConsolidatedSkill(bucket, skills, config) {
  const titleCase = bucket
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Collect all guidelines from source skills
  const allGuidelines = [];
  for (const skill of skills) {
    const content = readSkillContent(skill);
    if (content) {
      const guidelines = extractGuidelines(content);
      if (guidelines && guidelines.length > 50) {
        allGuidelines.push({
          skill,
          guidelines: guidelines.slice(0, 2000), // Limit each to 2000 chars
        });
      }
    }
  }

  // Build consolidated guidelines (limit total size)
  let consolidatedGuidelines = '';
  let currentSize = 0;
  const maxSize = 15000; // 15KB max for guidelines

  for (const { skill, guidelines } of allGuidelines) {
    const section = `### ${skill.replace(/-/g, ' ')}\n\n${guidelines}\n\n`;
    if (currentSize + section.length > maxSize) {
      consolidatedGuidelines += `\n... and ${allGuidelines.length - consolidatedGuidelines.split('###').length + 1} more skill guidelines (see references/)\n`;
      break;
    }
    consolidatedGuidelines += section;
    currentSize += section.length;
  }

  return `---
name: ${bucket}
description: ${config.description}
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [${config.tools.join(', ')}]
consolidated_from: ${skills.length} skills
best_practices:
  - Follow domain-specific conventions
  - Apply patterns consistently
  - Prioritize type safety and testing
error_handling: graceful
streaming: supported
---

# ${titleCase}

<identity>
You are a ${titleCase.toLowerCase()} with deep knowledge of ${config.description.toLowerCase()}.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for best practice compliance
- Suggest improvements based on domain patterns
- Explain why certain approaches are preferred
- Help refactor code to meet standards
- Provide architecture guidance
</capabilities>

<instructions>
${consolidatedGuidelines}
</instructions>

<examples>
Example usage:
\`\`\`
User: "Review this code for ${bucket.replace('-expert', '')} best practices"
Agent: [Analyzes code against consolidated guidelines and provides specific feedback]
\`\`\`
</examples>

## Consolidated Skills

This expert skill consolidates ${skills.length} individual skills:
${skills
  .slice(0, 20)
  .map(s => `- ${s}`)
  .join('\n')}
${skills.length > 20 ? `\n... and ${skills.length - 20} more (see references/)` : ''}

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
\`\`\`

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
`;
}

/**
 * Execute consolidation
 */
function executeConsolidation() {
  const { _bucketAssignments, unassigned, activeBuckets } = analyzeBuckets();

  if (!options.execute) {
    return;
  }

  console.log('\n🔧 EXECUTING CONSOLIDATION...\n');

  const consolidated = [];
  const removed = [];
  const errors = [];

  for (const { bucket, skills, config } of activeBuckets) {
    if (skills.length === 0) continue;

    try {
      console.log(`\n📦 Creating ${bucket}...`);

      // Create consolidated skill directory
      const skillDir = path.join(SKILLS_DIR, bucket);
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }

      // Generate and write consolidated skill
      const content = generateConsolidatedSkill(bucket, skills, config);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
      console.log(`   ✅ Created SKILL.md`);

      // Create scripts directory
      const scriptsDir = path.join(skillDir, 'scripts');
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      // Create main.cjs
      const mainScript = `#!/usr/bin/env node
/**
 * ${bucket} - Consolidated Expert Skill
 * Consolidates ${skills.length} individual skills
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(\`
${bucket} - Expert Skill

Usage:
  node main.cjs --list     List consolidated skills
  node main.cjs --help     Show this help

Description:
  ${config.description}

Consolidated from: ${skills.length} skills
\`);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log('Consolidated skills:');
  ${JSON.stringify(skills)}.forEach(s => console.log('  - ' + s));
  process.exit(0);
}

console.log('${bucket} skill loaded. Use with Claude for expert guidance.');
`;
      fs.writeFileSync(path.join(scriptsDir, 'main.cjs'), mainScript);
      console.log(`   ✅ Created scripts/main.cjs`);

      // Create references directory with list of source skills
      const refsDir = path.join(skillDir, 'references');
      if (!fs.existsSync(refsDir)) {
        fs.mkdirSync(refsDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(refsDir, 'source-skills.json'),
        JSON.stringify({ bucket, skills, consolidatedAt: new Date().toISOString() }, null, 2)
      );
      console.log(`   ✅ Created references/source-skills.json`);

      consolidated.push(bucket);

      // Remove source skills if --remove flag is set
      if (options.remove) {
        for (const skill of skills) {
          const skillPath = path.join(SKILLS_DIR, skill);
          if (fs.existsSync(skillPath)) {
            fs.rmSync(skillPath, { recursive: true, force: true });
            removed.push(skill);
          }
        }
        console.log(`   🗑️  Removed ${skills.length} source skills`);
      }
    } catch (e) {
      errors.push({ bucket, error: e.message });
      console.log(`   ❌ Error: ${e.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 CONSOLIDATION COMPLETE\n');
  console.log(`✅ Created: ${consolidated.length} expert skills`);
  if (options.remove) {
    console.log(`🗑️  Removed: ${removed.length} source skills`);
  }
  console.log(`⚠️  Unassigned: ${unassigned.length} skills (unchanged)`);
  console.log(`❌ Errors: ${errors.length}`);

  if (!options.remove) {
    console.log('\n💡 Run with --remove to delete source skills after consolidation');
  }

  // Update memory
  const memoryPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
  if (fs.existsSync(memoryPath)) {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `
## [${timestamp}] Skills Consolidated

- **Expert skills created**: ${consolidated.length}
- **Source skills consolidated**: ${activeBuckets.reduce((sum, b) => sum + b.skills.length, 0)}
${options.remove ? `- **Source skills removed**: ${removed.length}` : '- **Source skills preserved**: (run with --remove to clean up)'}
- **Expert skills**: ${consolidated.join(', ')}

`;
    const memContent = fs.readFileSync(memoryPath, 'utf-8');
    fs.writeFileSync(memoryPath, memContent + entry);
    console.log(`\n📝 Updated memory: ${memoryPath}`);
  }
}

// Help
if (options.help) {
  console.log(`
Skill Consolidation Tool

Consolidates granular skills into domain-based expert skills to reduce
context overhead and simplify router selection.

Usage:
  node consolidate.cjs                    Analyze and show consolidation plan
  node consolidate.cjs --execute          Execute consolidation
  node consolidate.cjs --execute --remove Execute and remove source skills
  node consolidate.cjs --verbose          Show all skills in each bucket
  node consolidate.cjs --list-buckets     List all defined buckets

Options:
  --execute     Perform the consolidation
  --remove      Remove source skills after consolidation
  --verbose     Show detailed skill lists
  --list-buckets List all domain buckets and their patterns
  --help        Show this help

Examples:
  # Preview consolidation
  node consolidate.cjs --verbose

  # Execute consolidation but keep source skills
  node consolidate.cjs --execute

  # Execute and clean up source skills
  node consolidate.cjs --execute --remove
`);
  process.exit(0);
}

if (options['list-buckets']) {
  console.log('\n📦 DOMAIN BUCKETS\n');
  for (const [bucket, config] of Object.entries(DOMAIN_BUCKETS)) {
    console.log(`${bucket}:`);
    console.log(`  Description: ${config.description}`);
    console.log(`  Patterns: ${config.patterns.map(p => p.toString()).join(', ')}`);
    console.log('');
  }
  process.exit(0);
}

// Main execution
executeConsolidation();
