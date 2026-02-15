#!/usr/bin/env node
'use strict';

function parseInput() {
  try {
    return JSON.parse(process.argv[2] || '{}');
  } catch {
    return {};
  }
}

function main() {
  const input = parseInput();
  const query = String(input.query || input.prompt || '').trim();
  if (!query) {
    console.error('token-saver-context-compression pre-execute: missing query');
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
