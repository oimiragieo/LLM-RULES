'use strict';

/**
 * Tests for persona identity (VAL-NC-004)
 *
 * Verifies that persona-injector.cjs uses agent terminology
 * ("General Worker Agent") and not legacy droid terminology.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  composePersona,
  BASE_WORKER_BOILERPLATE,
  SKILL_FALLBACK,
} = require('../../.claude/lib/mission/persona-injector.cjs');

let tempDir;
let skillsDir;
let missionDir;

describe('persona-identity (VAL-NC-004)', () => {
  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'persona-identity-test-'));
    skillsDir = path.join(tempDir, 'skills');
    missionDir = path.join(tempDir, 'mission');
    await fs.promises.mkdir(skillsDir, { recursive: true });
    await fs.promises.mkdir(missionDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(missionDir, 'mission.md'),
      '# Mission\n\n## Objectives\n- Test objective\n'
    );
  });

  after(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('BASE_WORKER_BOILERPLATE says "General Worker Agent" not "General Worker Droid"', () => {
    assert.ok(
      BASE_WORKER_BOILERPLATE.includes('General Worker Agent'),
      'BASE_WORKER_BOILERPLATE should say "General Worker Agent"'
    );
    assert.ok(
      !BASE_WORKER_BOILERPLATE.includes('General Worker Droid'),
      'BASE_WORKER_BOILERPLATE must not say "General Worker Droid"'
    );
  });

  it('composed prompt contains "General Worker Agent"', async () => {
    const feature = {
      id: 'test-feature',
      description: 'Test',
      expectedBehavior: [],
      verificationSteps: [],
    };

    const persona = composePersona({
      skillName: 'no-skill',
      skillSearchPaths: [skillsDir],
      missionPath: path.join(missionDir, 'mission.md'),
      feature,
    });

    assert.ok(
      persona.prompt.includes('General Worker Agent'),
      'Composed prompt should contain "General Worker Agent"'
    );
    assert.ok(
      !persona.prompt.includes('General Worker Droid'),
      'Composed prompt must not contain "General Worker Droid"'
    );
  });

  it('no "worker droid" brand references remain in exported strings', () => {
    const allExportedStrings = BASE_WORKER_BOILERPLATE + SKILL_FALLBACK;
    assert.ok(
      !allExportedStrings.toLowerCase().includes('worker droid'),
      'No "worker droid" brand references should remain in exported strings'
    );
  });
});
