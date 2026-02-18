import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ecosystemHealthCheck } from '../../.claude/tools/analysis/ecosystem-assessor/assess-ecosystem.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecosystem-health-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('ecosystemHealthCheck reports issues for orphaned skills and missing hooks', () => {
  const root = makeTempDir();
  const agentsDir = path.join(root, 'agents');
  const skillsDir = path.join(root, 'skills');
  const hooksDir = path.join(root, 'hooks');
  const workflowsDir = path.join(root, 'workflows');
  const settingsPath = path.join(root, 'settings.json');

  fs.mkdirSync(path.join(agentsDir, 'core'), { recursive: true });
  fs.writeFileSync(path.join(agentsDir, 'core', 'developer.md'), '# dev', 'utf8');
  fs.mkdirSync(path.join(skillsDir, 'orphan-skill'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'orphan-skill', 'SKILL.md'), '# skill', 'utf8');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.writeFileSync(path.join(workflowsDir, 'workflow-a.md'), '# wf', 'utf8');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              hooks: [{ command: 'node .claude/hooks/validation/missing-hook.cjs' }],
            },
          ],
        },
      },
      null,
      2
    ),
    'utf8'
  );

  try {
    const result = ecosystemHealthCheck({
      agentsDir,
      skillsDir,
      hooksDir,
      workflowsDir,
      settingsPath,
    });

    assert.equal(result.healthy, false);
    assert.ok(result.issues.some(issue => issue.includes('Orphaned skills')));
    assert.ok(result.issues.some(issue => issue.includes('missing on disk')));
  } finally {
    cleanup(root);
  }
});
