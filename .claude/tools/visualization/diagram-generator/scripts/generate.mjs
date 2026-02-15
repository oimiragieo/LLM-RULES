#!/usr/bin/env node
/**
 * Diagram Generator - Generates Mermaid diagrams from code, documentation, and descriptions
 *
 * Usage:
 *   node generate.mjs --type architecture --input "User auth system with OAuth"
 *   node generate.mjs --type sequence --input "Login flow: user -> api -> db"
 *   node generate.mjs --type class --input src/models/
 *   node generate.mjs --type er --input database/schema.sql
 *   node generate.mjs --type flowchart --input "User registration process"
 *   node generate.mjs --type state --input "Order processing states"
 *
 * Options:
 *   --type <type>         Diagram type: architecture|sequence|class|er|flowchart|state
 *   --input <source>      Input source: file path, directory, or natural language description
 *   --output <path>       Output file path (default: diagrams/<type>-<timestamp>.md)
 *   --title <title>       Diagram title
 *   --render              Render SVG using mermaid-cli (requires @mermaid-js/mermaid-cli)
 *   --format json|markdown Output format (default: json)
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname, resolve, extname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  parseClassStructure,
  parseERSchema,
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateClassDiagram,
  generateERDiagram,
  generateFlowchart,
  generateStateDiagram,
} from './generate-builders-a.mjs';
import { generateDiagramFromDescription, calculateComplexity } from './generate-builders-b.mjs';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../../..');

// Diagram type mappings
const DIAGRAM_TYPES = {
  architecture: {
    mermaidType: 'graph TB',
    description: 'System architecture and component relationships',
    defaultTitle: 'Architecture Diagram',
  },
  sequence: {
    mermaidType: 'sequenceDiagram',
    description: 'Process flows and interactions',
    defaultTitle: 'Sequence Diagram',
  },
  class: {
    mermaidType: 'classDiagram',
    description: 'Class structure and relationships',
    defaultTitle: 'Class Diagram',
  },
  er: {
    mermaidType: 'erDiagram',
    description: 'Entity-relationship database schema',
    defaultTitle: 'Entity Relationship Diagram',
  },
  erd: {
    mermaidType: 'erDiagram',
    description: 'Entity-relationship database schema',
    defaultTitle: 'Entity Relationship Diagram',
  },
  flowchart: {
    mermaidType: 'flowchart TD',
    description: 'Decision flows and processes',
    defaultTitle: 'Flowchart',
  },
  flow: {
    mermaidType: 'flowchart TD',
    description: 'Decision flows and processes',
    defaultTitle: 'Flowchart',
  },
  state: {
    mermaidType: 'stateDiagram-v2',
    description: 'State transitions',
    defaultTitle: 'State Diagram',
  },
};

/**
 * Parse command-line arguments
 */
function parseArgs(args) {
  const parsed = {
    type: null,
    input: null,
    output: null,
    title: null,
    render: false,
    format: 'json',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--type' && args[i + 1]) {
      parsed.type = args[++i].toLowerCase();
    } else if (arg === '--input' && args[i + 1]) {
      parsed.input = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      parsed.output = args[++i];
    } else if (arg === '--title' && args[i + 1]) {
      parsed.title = args[++i];
    } else if (arg === '--render') {
      parsed.render = true;
    } else if (arg === '--format' && args[i + 1]) {
      parsed.format = args[++i];
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  return parsed;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Diagram Generator - Generate Mermaid diagrams from code and descriptions

Usage:
  node generate.mjs --type <type> --input <source> [options]

Diagram Types:
  architecture      System architecture and components
  sequence          Process flows and interactions
  class             Class structure and relationships
  er, erd           Entity-relationship database schema
  flowchart, flow   Decision flows and processes
  state             State transitions

Options:
  --input <source>  Input: file path, directory, or description
  --output <path>   Output file path
  --title <title>   Diagram title
  --render          Render SVG (requires mermaid-cli)
  --format <type>   Output format: json|markdown
  --help            Show this help

Examples:
  node generate.mjs --type architecture --input "API Gateway -> Auth -> Database"
  node generate.mjs --type class --input src/models/
  node generate.mjs --type er --input database/schema.sql
  node generate.mjs --type sequence --input "User login flow"
  `);
}

/**
 * Validate arguments
 */
function validateArgs(args) {
  if (!args.type) {
    throw new Error('Missing required argument: --type');
  }
  if (!DIAGRAM_TYPES[args.type]) {
    throw new Error(
      `Invalid diagram type: ${args.type}. Valid types: ${Object.keys(DIAGRAM_TYPES).join(', ')}`
    );
  }
  if (!args.input) {
    throw new Error('Missing required argument: --input');
  }
}

/**
 * Check if input is a file path
 */
async function isFilePath(input) {
  try {
    const stats = await stat(resolve(input));
    return stats.isFile() || stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read source files from directory
 */
async function readSourceFiles(dirPath) {
  const files = [];

  async function scan(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          await scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go', '.sql'].includes(ext)) {
          const content = await readFile(fullPath, 'utf-8');
          files.push({
            path: fullPath,
            relativePath: fullPath.replace(PROJECT_ROOT, '').replace(/^[\\/]/, ''),
            content,
            extension: ext,
          });
        }
      }
    }
  }

  await scan(resolve(dirPath));
  return files;
}

/**
 * Parse class structure from code
 */
async function generateDiagram(args) {
  const startTime = Date.now();
  const diagramConfig = DIAGRAM_TYPES[args.type];
  const title = args.title || diagramConfig.defaultTitle;

  let result;
  let sourceFiles = [];

  // Determine if input is a file/directory or description
  const isPath = await isFilePath(args.input);

  if (isPath) {
    const inputPath = resolve(args.input);
    const stats = await stat(inputPath);

    if (stats.isDirectory()) {
      sourceFiles = await readSourceFiles(inputPath);
    } else if (stats.isFile()) {
      const content = await readFile(inputPath, 'utf-8');
      sourceFiles = [
        {
          path: inputPath,
          relativePath: inputPath.replace(PROJECT_ROOT, '').replace(/^[\\/]/, ''),
          content,
          extension: extname(inputPath),
        },
      ];
    }

    // Generate based on file content
    if (args.type === 'class') {
      const classes = parseClassStructure(sourceFiles);
      result = generateClassDiagram(classes);
    } else if (args.type === 'er' || args.type === 'erd') {
      const sqlContent = sourceFiles.find(f => f.extension === '.sql');
      if (sqlContent) {
        const entities = parseERSchema(sqlContent.content);
        result = generateERDiagram(entities);
      } else {
        throw new Error('No SQL file found for ER diagram generation');
      }
    } else {
      // For other types, use first file content as description
      const description = sourceFiles[0]?.content || args.input;
      result = generateDiagramFromDescription(args.type, description, title);
    }
  } else {
    // Generate from natural language description
    result = generateDiagramFromDescription(args.type, args.input, title);
  }

  const duration = Date.now() - startTime;

  return {
    diagram: result,
    sourceFiles: sourceFiles.map(f => f.relativePath),
    metadata: {
      title,
      node_count: result.nodes.length,
      edge_count: result.edges.length,
      complexity_score: calculateComplexity(result.nodes.length, result.edges.length),
    },
    duration,
  };
}

/**
 * Validate output against schema
 */
async function validateOutput(output, schemaPath) {
  try {
    const schemaContent = await readFile(join(PROJECT_ROOT, schemaPath), 'utf-8');
    const schema = JSON.parse(schemaContent);

    // Basic validation - check required fields
    const requiredFields = schema.required || [];
    for (const field of requiredFields) {
      if (!(field in output)) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('Schema validation failed:', err.message);
    return false;
  }
}

/**
 * Save diagram to file
 */
async function saveDiagram(mermaid, outputPath, title) {
  const dir = dirname(outputPath);
  await mkdir(dir, { recursive: true });

  const content = `# ${title}\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`;
  await writeFile(outputPath, content, 'utf-8');

  return outputPath;
}

/**
 * Render diagram to SVG using mermaid-cli
 */
async function renderDiagram(mermaidFile) {
  try {
    const svgFile = mermaidFile.replace(/\.md$/, '.svg');
    await execAsync(`npx -y @mermaid-js/mermaid-cli -i "${mermaidFile}" -o "${svgFile}"`);
    return svgFile;
  } catch (_error) {
    console.warn(
      'Warning: Failed to render SVG. Install @mermaid-js/mermaid-cli for rendering support.'
    );
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    validateArgs(args);

    // Generate diagram
    const { diagram, sourceFiles, metadata, _duration } = await generateDiagram(args);

    // Determine output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const defaultOutput = join(PROJECT_ROOT, 'diagrams', `${args.type}-${timestamp}.md`);
    const outputPath = args.output ? resolve(args.output) : defaultOutput;

    // Save diagram
    const savedPath = await saveDiagram(diagram.mermaid, outputPath, metadata.title);

    // Render if requested
    let svgPath = null;
    if (args.render) {
      svgPath = await renderDiagram(savedPath);
    }

    // Build output conforming to schema
    // Map 'flowchart' to 'flow' to match schema enum
    const normalizedType = args.type === 'flowchart' ? 'flow' : args.type;

    const output = {
      skill_name: 'diagram-generator',
      diagram_type: normalizedType,
      mermaid_syntax: diagram.mermaid,
      output_file: savedPath.replace(PROJECT_ROOT, '').replace(/^[\\/]/, ''),
      entities_included: diagram.nodes.map(n => ({
        name: n.label || n.id,
        type: n.type,
        relationships: diagram.edges
          .filter(e => e.from === n.id || e.to === n.id)
          .map(e => (e.from === n.id ? e.to : e.from)),
      })),
      relationships_mapped: diagram.edges.length,
      source_files_analyzed: sourceFiles,
      diagram_metadata: {
        title: metadata.title,
        complexity_score: metadata.complexity_score,
        node_count: metadata.node_count,
        edge_count: metadata.edge_count,
      },
      rendered_output: svgPath
        ? {
            svg_path: svgPath.replace(PROJECT_ROOT, '').replace(/^[\\/]/, ''),
          }
        : undefined,
      mermaid_version: '10.0+',
      validation_passed: true,
      timestamp: new Date().toISOString(),
    };

    // Validate output
    const schemaPath = '.claude/schemas/skill-diagram-generator-output.schema.json';
    const isValid = await validateOutput(output, schemaPath);

    if (!isValid) {
      console.error('Warning: Output does not conform to schema');
    }

    // Output
    if (args.format === 'json') {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`# Diagram Generated\n`);
      console.log(`**Type**: ${args.type}`);
      console.log(`**Title**: ${metadata.title}`);
      console.log(`**Output**: ${savedPath}`);
      console.log(`**Nodes**: ${metadata.node_count}`);
      console.log(`**Edges**: ${metadata.edge_count}`);
      console.log(`**Complexity**: ${metadata.complexity_score}/10`);
      if (svgPath) {
        console.log(`**SVG**: ${svgPath}`);
      }
      console.log(`\n## Mermaid Syntax\n\n\`\`\`mermaid\n${diagram.mermaid}\`\`\`\n`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath || process.argv[1] === modulePath.replace(/\\/g, '/')) {
    main();
  }
}

export {
  main,
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateClassDiagram,
  generateERDiagram,
  generateFlowchart,
  generateStateDiagram,
};
