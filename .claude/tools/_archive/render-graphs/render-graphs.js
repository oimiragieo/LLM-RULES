#!/usr/bin/env node
/**
 * Render Graphviz Diagrams from Skills
 *
 * Renders graphviz diagrams (```dot blocks) from SKILL.md files to SVG.
 * Useful for visualizing process flows defined in skills.
 *
 * USAGE:
 *   node render-graphs.js <skill-directory>           # Render each diagram separately
 *   node render-graphs.js <skill-directory> --combine # Combine all into one diagram
 *
 * EXAMPLES:
 *   node render-graphs.js .claude/skills/tdd
 *   node render-graphs.js .claude/skills/debugging --combine
 *
 * REQUIREMENTS:
 *   - Graphviz (dot) must be installed
 *   - Windows: choco install graphviz
 *   - macOS: brew install graphviz
 *   - Linux: apt install graphviz
 *
 * OUTPUT:
 *   Creates a 'diagrams' subdirectory in the skill directory with:
 *   - Individual SVG files for each ```dot block
 *   - Or a combined SVG if --combine is specified
 *
 * INTEGRATION:
 *   Used by the 'writing-skills' skill to generate visual documentation.
 *   Helps human partners understand complex workflow diagrams.
 *
 * Adapted from Superpowers for the agent-studio framework.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Extract all ```dot blocks from markdown content.
 *
 * @param {string} markdown - Markdown content
 * @returns {Array<{name: string, content: string}>}
 */
function extractDotBlocks(markdown) {
  const blocks = [];
  const regex = /```dot\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const content = match[1].trim();

    // Extract digraph name
    const nameMatch = content.match(/digraph\s+(\w+)/);
    const name = nameMatch ? nameMatch[1] : `graph_${blocks.length + 1}`;

    blocks.push({ name, content });
  }

  return blocks;
}

/**
 * Extract just the body (nodes and edges) from a digraph.
 *
 * @param {string} dotContent - Full digraph content
 * @returns {string} - Body without digraph wrapper
 */
function extractGraphBody(dotContent) {
  const match = dotContent.match(/digraph\s+\w+\s*\{([\s\S]*)\}/);
  if (!match) return '';

  let body = match[1];

  // Remove rankdir (we'll set it once at the top level for combined graphs)
  body = body.replace(/^\s*rankdir\s*=\s*\w+\s*;?\s*$/gm, '');

  return body.trim();
}

/**
 * Combine multiple graphs into a single digraph with subgraphs.
 *
 * @param {Array<{name: string, content: string}>} blocks - Dot blocks
 * @param {string} skillName - Name for the combined graph
 * @returns {string} - Combined digraph
 */
function combineGraphs(blocks, skillName) {
  const bodies = blocks.map((block, i) => {
    const body = extractGraphBody(block.content);
    return `  subgraph cluster_${i} {
    label="${block.name}";
    ${body
      .split('\n')
      .map(line => '  ' + line)
      .join('\n')}
  }`;
  });

  return `digraph ${skillName}_combined {
  rankdir=TB;
  compound=true;
  newrank=true;

${bodies.join('\n\n')}
}`;
}

/**
 * Render dot content to SVG using the graphviz dot command.
 *
 * @param {string} dotContent - Graphviz dot content
 * @returns {string|null} - SVG content or null on error
 */
function renderToSvg(dotContent) {
  try {
    return execSync('dot -Tsvg', {
      input: dotContent,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    console.error('Error running dot:', err.message);
    if (err.stderr) console.error(err.stderr.toString());
    return null;
  }
}

/**
 * Check if graphviz is installed.
 *
 * @returns {boolean}
 */
function checkGraphvizInstalled() {
  try {
    // Try 'where' on Windows, 'which' on Unix
    const cmd = process.platform === 'win32' ? 'where dot' : 'which dot';
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Print usage instructions.
 */
function printUsage() {
  console.error('Usage: render-graphs.js <skill-directory> [--combine]');
  console.error('');
  console.error('Options:');
  console.error('  --combine    Combine all diagrams into one SVG');
  console.error('');
  console.error('Example:');
  console.error('  node render-graphs.js .claude/skills/subagent-driven-development');
  console.error('  node render-graphs.js .claude/skills/subagent-driven-development --combine');
}

/**
 * Main entry point.
 */
function main() {
  const args = process.argv.slice(2);
  const combine = args.includes('--combine');
  const skillDirArg = args.find(a => !a.startsWith('--'));

  if (!skillDirArg) {
    printUsage();
    process.exit(1);
  }

  const skillDir = path.resolve(skillDirArg);
  const skillFile = path.join(skillDir, 'SKILL.md');
  const skillName = path.basename(skillDir).replace(/-/g, '_');

  if (!fs.existsSync(skillFile)) {
    console.error(`Error: ${skillFile} not found`);
    process.exit(1);
  }

  // Check if dot is available
  if (!checkGraphvizInstalled()) {
    console.error('Error: graphviz (dot) not found.');
    console.error('Install with:');
    console.error('  choco install graphviz    # Windows');
    console.error('  brew install graphviz     # macOS');
    console.error('  apt install graphviz      # Linux');
    process.exit(1);
  }

  const markdown = fs.readFileSync(skillFile, 'utf-8');
  const blocks = extractDotBlocks(markdown);

  if (blocks.length === 0) {
    console.log('No ```dot blocks found in', skillFile);
    process.exit(0);
  }

  console.log(`Found ${blocks.length} diagram(s) in ${path.basename(skillDir)}/SKILL.md`);

  const outputDir = path.join(skillDir, 'diagrams');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (combine) {
    // Combine all graphs into one
    const combined = combineGraphs(blocks, skillName);
    const svg = renderToSvg(combined);
    if (svg) {
      const outputPath = path.join(outputDir, `${skillName}_combined.svg`);
      fs.writeFileSync(outputPath, svg);
      console.log(`  Rendered: ${skillName}_combined.svg`);

      // Also write the dot source for debugging
      const dotPath = path.join(outputDir, `${skillName}_combined.dot`);
      fs.writeFileSync(dotPath, combined);
      console.log(`  Source: ${skillName}_combined.dot`);
    } else {
      console.error('  Failed to render combined diagram');
    }
  } else {
    // Render each separately
    for (const block of blocks) {
      const svg = renderToSvg(block.content);
      if (svg) {
        const outputPath = path.join(outputDir, `${block.name}.svg`);
        fs.writeFileSync(outputPath, svg);
        console.log(`  Rendered: ${block.name}.svg`);
      } else {
        console.error(`  Failed: ${block.name}`);
      }
    }
  }

  console.log(`\nOutput: ${outputDir}/`);
}

main();
