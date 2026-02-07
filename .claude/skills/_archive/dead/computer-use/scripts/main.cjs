#!/usr/bin/env node

/**
 * Computer Use - Main Script
 * Claude Computer Use tool integration for desktop automation.
 *
 * Usage:
 *   node main.cjs [options]
 *
 * Options:
 *   --help              Show this help message
 *   --config            Generate tool configuration JSON
 *   --width <px>        Display width (default: 1024)
 *   --height <px>       Display height (default: 768)
 *   --display <num>     Display number (default: 1)
 *   --model <model>     Model type: sonnet, opus45 (default: sonnet)
 *   --validate <json>   Validate an action JSON
 *   --scale <json>      Scale coordinates JSON (fromW,fromH,toW,toH,x,y)
 *   --actions           List all available actions
 *   --docker            Show Docker run command
 */

const fs = require('fs');
const path = require('path');

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const _CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

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

// Tool versions and their features
const TOOL_VERSIONS = {
  sonnet: {
    type: 'computer_20250124',
    beta: 'computer-use-2025-01-24',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-3-5-20241022'],
    actions: [
      'screenshot',
      'left_click',
      'right_click',
      'middle_click',
      'double_click',
      'triple_click',
      'type',
      'key',
      'mouse_move',
      'scroll',
      'left_click_drag',
      'left_mouse_down',
      'left_mouse_up',
      'hold_key',
      'wait',
    ],
  },
  opus45: {
    type: 'computer_20251124',
    beta: 'computer-use-2025-11-24',
    models: ['claude-opus-4-5-20251101'],
    actions: [
      'screenshot',
      'left_click',
      'right_click',
      'middle_click',
      'double_click',
      'triple_click',
      'type',
      'key',
      'mouse_move',
      'scroll',
      'left_click_drag',
      'left_mouse_down',
      'left_mouse_up',
      'hold_key',
      'wait',
      'zoom', // Opus 4.5 only
    ],
    extraConfig: {
      enable_zoom: true,
    },
  },
};

// Action schemas for validation
const ACTION_SCHEMAS = {
  screenshot: {
    required: ['action'],
    optional: [],
  },
  left_click: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  right_click: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  middle_click: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  double_click: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  triple_click: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  type: {
    required: ['action', 'text'],
    optional: [],
  },
  key: {
    required: ['action', 'text'],
    optional: [],
  },
  mouse_move: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  scroll: {
    required: ['action', 'coordinate', 'scroll_direction', 'scroll_amount'],
    optional: [],
  },
  left_click_drag: {
    required: ['action', 'start_coordinate', 'coordinate'],
    optional: [],
  },
  left_mouse_down: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  left_mouse_up: {
    required: ['action', 'coordinate'],
    optional: [],
  },
  hold_key: {
    required: ['action', 'text', 'duration'],
    optional: [],
  },
  wait: {
    required: ['action', 'duration'],
    optional: [],
  },
  zoom: {
    required: ['action', 'coordinate', 'zoom_direction', 'zoom_amount'],
    optional: [],
  },
};

/**
 * Generate tool configuration
 */
function generateConfig(width, height, displayNum, modelType) {
  const version = TOOL_VERSIONS[modelType] || TOOL_VERSIONS.sonnet;

  const config = {
    type: version.type,
    name: 'computer',
    display_width_px: parseInt(width) || 1024,
    display_height_px: parseInt(height) || 768,
    display_number: parseInt(displayNum) || 1,
    ...version.extraConfig,
  };

  return {
    tool: config,
    beta: version.beta,
    recommended_models: version.models,
    available_actions: version.actions,
  };
}

/**
 * Validate an action JSON
 */
function validateAction(actionJson, modelType) {
  try {
    const action = typeof actionJson === 'string' ? JSON.parse(actionJson) : actionJson;
    const version = TOOL_VERSIONS[modelType] || TOOL_VERSIONS.sonnet;

    if (!action.action) {
      return { valid: false, error: 'Missing required field: action' };
    }

    if (!version.actions.includes(action.action)) {
      return {
        valid: false,
        error: `Unknown action: ${action.action}. Available: ${version.actions.join(', ')}`,
      };
    }

    const schema = ACTION_SCHEMAS[action.action];
    if (!schema) {
      return { valid: false, error: `No schema for action: ${action.action}` };
    }

    // Check required fields
    for (const field of schema.required) {
      if (!(field in action)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate coordinate format
    if ('coordinate' in action) {
      if (!Array.isArray(action.coordinate) || action.coordinate.length !== 2) {
        return { valid: false, error: 'coordinate must be [x, y] array' };
      }
    }

    if ('start_coordinate' in action) {
      if (!Array.isArray(action.start_coordinate) || action.start_coordinate.length !== 2) {
        return { valid: false, error: 'start_coordinate must be [x, y] array' };
      }
    }

    // Validate scroll direction
    if ('scroll_direction' in action) {
      if (!['up', 'down', 'left', 'right'].includes(action.scroll_direction)) {
        return { valid: false, error: 'scroll_direction must be: up, down, left, right' };
      }
    }

    // Validate zoom direction (Opus 4.5 only)
    if ('zoom_direction' in action) {
      if (!['in', 'out'].includes(action.zoom_direction)) {
        return { valid: false, error: 'zoom_direction must be: in, out' };
      }
    }

    return { valid: true, action };
  } catch (e) {
    return { valid: false, error: `JSON parse error: ${e.message}` };
  }
}

/**
 * Scale coordinates between resolutions
 */
function scaleCoordinates(fromWidth, fromHeight, toWidth, toHeight, x, y) {
  return {
    original: { x, y, resolution: `${fromWidth}x${fromHeight}` },
    scaled: {
      x: Math.round((x * toWidth) / fromWidth),
      y: Math.round((y * toHeight) / fromHeight),
      resolution: `${toWidth}x${toHeight}`,
    },
    scale_factors: {
      x: toWidth / fromWidth,
      y: toHeight / fromHeight,
    },
  };
}

/**
 * Generate Docker run command
 */
function getDockerCommand() {
  return `# Anthropic Computer Use Reference Container

# Pull the latest image
docker pull ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

# Run with your API key
docker run -it --rm \\
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \\
  -v $(pwd)/output:/home/computeruse/output \\
  -p 5900:5900 \\
  -p 8501:8501 \\
  -p 6080:6080 \\
  -p 8080:8080 \\
  ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

# Access points:
# - VNC viewer: localhost:5900 (password: "secret")
# - noVNC web interface: http://localhost:6080/vnc.html
# - Streamlit demo UI: http://localhost:8501
# - HTTP API: http://localhost:8080

# For Windows, replace $(pwd) with %cd% or use absolute path
# For PowerShell, replace $(pwd) with $(Get-Location)`;
}

/**
 * List all available actions
 */
function listActions() {
  console.log('Computer Use Actions Reference\n');
  console.log('='.repeat(60));

  console.log('\nBasic Actions (all versions):');
  console.log('-'.repeat(40));
  console.log('  screenshot        Capture current screen');
  console.log('  left_click        Click at coordinate');
  console.log('  type              Type text string');
  console.log('  key               Press key combination');
  console.log('  mouse_move        Move cursor to coordinate');

  console.log('\nEnhanced Actions (computer_20250124+):');
  console.log('-'.repeat(40));
  console.log('  scroll            Scroll at coordinate');
  console.log('  left_click_drag   Drag from start to end');
  console.log('  right_click       Right-click at coordinate');
  console.log('  middle_click      Middle-click at coordinate');
  console.log('  double_click      Double-click at coordinate');
  console.log('  triple_click      Triple-click at coordinate');
  console.log('  left_mouse_down   Press mouse button');
  console.log('  left_mouse_up     Release mouse button');
  console.log('  hold_key          Hold key for duration');
  console.log('  wait              Wait for duration');

  console.log('\nOpus 4.5 Only (computer_20251124):');
  console.log('-'.repeat(40));
  console.log('  zoom              Zoom in/out at coordinate');

  console.log('\nAction Examples:');
  console.log('-'.repeat(40));
  console.log('  { "action": "screenshot" }');
  console.log('  { "action": "left_click", "coordinate": [500, 300] }');
  console.log('  { "action": "type", "text": "Hello, world!" }');
  console.log('  { "action": "key", "text": "ctrl+s" }');
  console.log('  { "action": "scroll", "coordinate": [500, 400],');
  console.log('    "scroll_direction": "down", "scroll_amount": 3 }');
  console.log('  { "action": "wait", "duration": 2.0 }');
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Computer Use - Main Script
Claude Computer Use tool integration for desktop automation.

Usage:
  node main.cjs [options]

Options:
  --help              Show this help message
  --config            Generate tool configuration JSON
  --width <px>        Display width (default: 1024)
  --height <px>       Display height (default: 768)
  --display <num>     Display number (default: 1)
  --model <model>     Model type: sonnet, opus45 (default: sonnet)
  --validate <json>   Validate an action JSON
  --scale <json>      Scale coordinates (format: fromW,fromH,toW,toH,x,y)
  --actions           List all available actions
  --docker            Show Docker run command

Examples:
  # Generate config for Sonnet
  node main.cjs --config

  # Generate config for Opus 4.5 at 1920x1080
  node main.cjs --config --model opus45 --width 1920 --height 1080

  # Validate an action
  node main.cjs --validate '{"action":"left_click","coordinate":[500,300]}'

  # Scale coordinates from 1024x768 to 1920x1080
  node main.cjs --scale "1024,768,1920,1080,500,400"

  # List all actions
  node main.cjs --actions

  # Get Docker command
  node main.cjs --docker
`);
}

/**
 * Main execution
 */
function main() {
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.config) {
    const config = generateConfig(options.width, options.height, options.display, options.model);

    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }

  if (options.validate) {
    const result = validateAction(options.validate, options.model);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  if (options.scale) {
    const parts = options.scale.split(',').map(Number);
    if (parts.length !== 6) {
      console.error('Scale format: fromW,fromH,toW,toH,x,y');
      process.exit(1);
    }
    const [fromW, fromH, toW, toH, x, y] = parts;
    const result = scaleCoordinates(fromW, fromH, toW, toH, x, y);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (options.actions) {
    listActions();
    process.exit(0);
  }

  if (options.docker) {
    console.log(getDockerCommand());
    process.exit(0);
  }

  // Default: show config
  console.log('Computer Use Skill - Configuration Helper\n');
  console.log('Use --help for available options\n');

  console.log('Quick Start:');
  console.log('  node main.cjs --config          # Generate tool config');
  console.log('  node main.cjs --docker          # Get Docker command');
  console.log('  node main.cjs --actions         # List all actions');

  console.log('\nDefault Configuration:');
  const config = generateConfig(1024, 768, 1, 'sonnet');
  console.log(JSON.stringify(config, null, 2));
}

main();
