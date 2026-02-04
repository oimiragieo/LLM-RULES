#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const COMMANDS_DIR = path.join(PROJECT_ROOT, '.claude', 'commands');

function listCommandFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) return null;
  const frontmatterLines = lines.slice(1, endIndex);
  const frontmatter = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }
  return frontmatter;
}

function validateCommandFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return [filePath + ': empty file'];
  }
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [filePath + ': missing frontmatter (---)'];
  }
  if (!frontmatter.description || !String(frontmatter.description).trim()) {
    return [filePath + ': missing frontmatter description'];
  }
  return [];
}

function main() {
  const files = listCommandFiles(COMMANDS_DIR);
  if (files.length === 0) {
    console.error('No command markdown files found.');
    process.exit(1);
  }

  const errors = [];
  for (const filePath of files) {
    errors.push(...validateCommandFile(filePath));
  }

  if (errors.length > 0) {
    console.error('Command validation failed:');
    for (const error of errors) {
      console.error('- ' + error);
    }
    process.exit(1);
  }

  console.log('Command validation passed (' + files.length + ' files).');
}

main();