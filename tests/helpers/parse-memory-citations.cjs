#!/usr/bin/env node
'use strict';

function parseCitations(text) {
  const input = String(text || '');
  const matches = input.match(/\[(mem|rag):[a-f0-9]{8}\]/g) || [];
  return [...new Set(matches)];
}

function parseEvidenceFromPrompt(prompt) {
  const input = String(prompt || '');
  const lines = input.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const match = line.match(/\[(mem|rag):[a-f0-9]{8}\]/);
    if (!match) continue;
    const id = match[0];
    const content = line.replace(/^-\s*\[(mem|rag):[a-f0-9]{8}\]\s*/, '').trim();
    map.set(id, content);
  }

  return map;
}

module.exports = {
  parseCitations,
  parseEvidenceFromPrompt,
};
