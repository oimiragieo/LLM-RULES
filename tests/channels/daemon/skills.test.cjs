'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-skills-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignored */
  }
});

describe('SkillStore', () => {
  const { SkillStore } = require('../../../scripts/channels/daemon/skills.cjs');

  it('module loads without error', () => {
    assert.ok(SkillStore);
  });

  it('constructor creates skills directory', () => {
    const store = new SkillStore(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills')));
    assert.equal(store.skills.length, 0);
  });

  it('addSkill() stores a skill', () => {
    const store = new SkillStore(tmpDir);
    store.addSkill({
      name: 'fix-cors',
      triggers: ['cors', 'access-control', 'origin'],
      description: 'Fix CORS issues in Express',
      solution: 'Add cors middleware: app.use(cors())',
    });
    assert.equal(store.skills.length, 1);
    assert.equal(store.skills[0].name, 'fix-cors');
  });

  it('addSkill() persists to disk', () => {
    const store1 = new SkillStore(tmpDir);
    store1.addSkill({
      name: 'fix-cors',
      triggers: ['cors'],
      description: 'Fix CORS',
      solution: 'Use cors middleware',
    });

    const store2 = new SkillStore(tmpDir);
    assert.equal(store2.skills.length, 1);
    assert.equal(store2.skills[0].name, 'fix-cors');
  });

  it('addSkill() deduplicates by name', () => {
    const store = new SkillStore(tmpDir);
    store.addSkill({ name: 'fix-cors', triggers: ['cors'], description: 'v1', solution: 'old' });
    store.addSkill({
      name: 'fix-cors',
      triggers: ['cors', 'origin'],
      description: 'v2',
      solution: 'new',
    });
    assert.equal(store.skills.length, 1);
    assert.equal(store.skills[0].solution, 'new'); // Updated
    assert.equal(store.skills[0].triggers.length, 2);
  });

  it('findMatchingSkills() returns matches', () => {
    const store = new SkillStore(tmpDir);
    store.addSkill({
      name: 'fix-cors',
      triggers: ['cors', 'origin'],
      description: 'Fix CORS',
      solution: 'Use cors()',
    });
    store.addSkill({
      name: 'fix-eslint',
      triggers: ['eslint', 'lint'],
      description: 'Fix lint',
      solution: 'Run eslint --fix',
    });

    const matches = store.findMatchingSkills('getting a cors error when calling the API');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, 'fix-cors');
  });

  it('findMatchingSkills() returns empty for no match', () => {
    const store = new SkillStore(tmpDir);
    store.addSkill({
      name: 'fix-cors',
      triggers: ['cors'],
      description: 'Fix CORS',
      solution: 'Use cors()',
    });
    const matches = store.findMatchingSkills('how do I deploy to kubernetes');
    assert.equal(matches.length, 0);
  });

  it('getSkillContext() returns formatted context', () => {
    const store = new SkillStore(tmpDir);
    store.addSkill({
      name: 'fix-cors',
      triggers: ['cors'],
      description: 'Fix CORS',
      solution: 'Add app.use(cors())',
    });
    const ctx = store.getSkillContext('cors error in my api');
    assert.ok(ctx.includes('fix-cors'));
    assert.ok(ctx.includes('app.use(cors())'));
  });

  it('getSkillContext() returns empty for no match', () => {
    const store = new SkillStore(tmpDir);
    const ctx = store.getSkillContext('hello world');
    assert.equal(ctx, '');
  });

  it('caps at MAX_SKILLS (50)', () => {
    const store = new SkillStore(tmpDir);
    for (let i = 0; i < 55; i++) {
      store.addSkill({
        name: `skill-${i}`,
        triggers: [`trigger${i}`],
        description: `desc ${i}`,
        solution: `sol ${i}`,
      });
    }
    assert.equal(store.skills.length, 50); // Capped
  });
});
