#!/usr/bin/env node
'use strict';

/**
 * webmcp-browser-tools — companion CLI tool
 *
 * Reports current WebMCP browser support status and available polyfill packages.
 *
 * Usage:
 *   node .claude/tools/webmcp-browser-tools/webmcp-browser-tools.cjs [--status] [--packages] [--help]
 */

const STATUS = {
  spec: 'W3C Community Group Draft (webmachinelearning/webmcp)',
  specUrl: 'https://github.com/webmachinelearning/webmcp',
  lastUpdated: '2026-02-22',
  browsers: {
    chrome: 'Early preview in Chrome 146 Canary (Feb 2026) — flag: Experimental Web Platform Features',
    firefox: 'Not shipped — no intent-to-implement filed',
    safari: 'Not shipped — no intent-to-implement filed',
  },
  stableEstimate: 'Chrome stable: ~mid-to-late 2026',
  apiSurface: 'window.navigator.modelContext.provideContext({ tools: [...] })',
};

const PACKAGES = [
  { name: '@mcp-b/react-webmcp', version: '1.1.1', purpose: 'React hooks for WebMCP tool registration' },
  { name: '@mcp-b/webmcp-polyfill', version: 'latest', purpose: 'Strict WebMCP polyfill for any framework' },
  { name: '@mcp-b/webmcp-types', version: 'latest', purpose: 'TypeScript type definitions' },
  { name: '@mcp-b/transports', version: 'latest', purpose: 'Browser transport layer (WebSocket/postMessage)' },
  { name: '@mcp-b/webmcp-ts-sdk', version: 'latest', purpose: 'Adapts official MCP TypeScript SDK for browsers' },
  { name: '@mcp-b/create-webmcp-app', version: 'latest', purpose: 'Scaffolding tool for new WebMCP apps' },
];

function printStatus() {
  process.stdout.write('\n=== WebMCP Browser Support Status ===\n');
  process.stdout.write(`Spec:            ${STATUS.spec}\n`);
  process.stdout.write(`Spec URL:        ${STATUS.specUrl}\n`);
  process.stdout.write(`API Surface:     ${STATUS.apiSurface}\n`);
  process.stdout.write(`Last Updated:    ${STATUS.lastUpdated}\n\n`);
  process.stdout.write('Browser Support:\n');
  for (const [browser, status] of Object.entries(STATUS.browsers)) {
    process.stdout.write(`  ${browser.padEnd(10)}: ${status}\n`);
  }
  process.stdout.write(`\nStable ETA:      ${STATUS.stableEstimate}\n`);
}

function printPackages() {
  process.stdout.write('\n=== Available npm Packages (@mcp-b ecosystem) ===\n');
  for (const pkg of PACKAGES) {
    process.stdout.write(`  ${pkg.name.padEnd(35)} v${pkg.version.padEnd(8)} — ${pkg.purpose}\n`);
  }
  process.stdout.write('\nInstall polyfill:\n');
  process.stdout.write('  npm install @mcp-b/webmcp-polyfill\n');
  process.stdout.write('\nInstall React integration:\n');
  process.stdout.write('  npm install @mcp-b/react-webmcp\n\n');
}

function printHelp() {
  process.stdout.write('WebMCP Browser Tools — status and package info\n\n');
  process.stdout.write('Usage: node webmcp-browser-tools.cjs [options]\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --status     Show current browser support status\n');
  process.stdout.write('  --packages   Show available npm packages\n');
  process.stdout.write('  --all        Show status and packages\n');
  process.stdout.write('  --help       Show this help\n\n');
  process.stdout.write('Remember: WebMCP exposes web app functionality TO agents.\n');
  process.stdout.write('It is NOT for scraping external pages (use WebFetch/Exa for that).\n\n');
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  printHelp();
  printStatus();
  printPackages();
} else {
  if (args.includes('--status') || args.includes('--all')) printStatus();
  if (args.includes('--packages') || args.includes('--all')) printPackages();
  if (!args.some(a => ['--status', '--packages', '--all'].includes(a))) {
    process.stderr.write(`Unknown option: ${args[0]}\n`);
    printHelp();
    process.exit(1);
  }
}
