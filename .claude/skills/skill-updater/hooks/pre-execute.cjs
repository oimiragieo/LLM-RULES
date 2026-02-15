#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const input = JSON.parse(process.argv[2] || '{}');
const rawSkill = String(input.skill || input.name || '').trim();
const trigger = String(input.trigger || 'manual').trim();

if (!rawSkill) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'Missing skill target (skill/name).' }));
  process.exit(1);
}

if (!['manual', 'reflection', 'evolve'].includes(trigger)) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: 'Invalid trigger. Use manual|reflection|evolve.' })
  );
  process.exit(1);
}

const normalizedPath = rawSkill.includes('.claude/skills/')
  ? rawSkill.replace(/\\/g, '/')
  : `.claude/skills/${rawSkill}/SKILL.md`;

const absolutePath = path.join(process.cwd(), normalizedPath);
const exists = fs.existsSync(absolutePath);

process.stdout.write(
  JSON.stringify({
    ok: true,
    trigger,
    skill: rawSkill,
    skillPath: normalizedPath,
    exists,
    mode: exists ? 'refresh' : 'create',
  })
);
process.exit(0);
