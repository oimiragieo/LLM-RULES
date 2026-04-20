'use strict';

/**
 * Cross-Area Integration Tests
 *
 * Wires mission orchestrator, plugin system, headless exec engine, and code
 * review pipeline together to verify the three cross-area assertions:
 *
 *   VAL-CROSS-001:
 *     ExecEngine (--auto high) invokes startMission, runs a dispatch loop with
 *     mock workers, and returns a structured JSON result once the mission
 *     completes.
 *
 *   VAL-CROSS-002:
 *     A mock plugin with a custom skill is installed into a temp plugin scope.
 *     The PluginResolver finds it; PluginLoader.getSkillSearchPaths() exposes
 *     its skills/ directory; composePersona() loads the skill template via
 *     those search paths — proving end-to-end persona injection from a plugin.
 *
 *   VAL-CROSS-003:
 *     ExecEngine (--auto high, --output json) runs a _processPrompt that
 *     creates a ReviewPipeline over synthetic diffData and returns the
 *     structured JSON review output.  The exec formatter wraps this in its
 *     own JSON envelope, which is fully parseable.
 *
 * All tests use mock workers and temp directories — no real LLM calls, no
 * real git operations.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const { ExecEngine } = require('../../.claude/lib/exec/engine.cjs');
const { startMission } = require('../../.claude/lib/orchestration/mission-cli.cjs');
const { createDispatchLoop } = require('../../.claude/lib/orchestration/dispatch-loop.cjs');
const { createHandoffPipeline } = require('../../.claude/lib/orchestration/handoff-pipeline.cjs');
const {
  createMilestoneManager,
  createProgressLogger,
} = require('../../.claude/lib/orchestration/milestone-manager.cjs');
const { saveState } = require('../../.claude/lib/orchestration/state-recovery.cjs');
const { FrictionLoopEngine } = require('../../.claude/lib/mission/friction-loop.cjs');
const { PluginResolver } = require('../../.claude/lib/plugins/resolver.cjs');
const { PluginLoader } = require('../../.claude/lib/plugins/loader.cjs');
const { composePersona } = require('../../.claude/lib/mission/persona-injector.cjs');
const { ReviewPipeline } = require('../../.claude/lib/review/pipeline.cjs');
const { createMockDb, createMockBudget } = require('../integration/helpers/mock-factory.cjs');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Atomically write JSON to a file.
 *
 * @param {string} filePath
 * @param {object} data
 */
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Write a timestamped handoff JSON file to the handoffs directory.
 *
 * @param {string} handoffsDir
 * @param {string} featureId
 * @returns {string} path to the written file
 */
function writeHandoff(handoffsDir, featureId) {
  fs.mkdirSync(handoffsDir, { recursive: true });
  const filename = `${Date.now()}-${featureId}.json`;
  const handoffPath = path.join(handoffsDir, filename);
  writeJSON(handoffPath, { featureId, status: 'done', files: ['mock.js'] });
  return handoffPath;
}

/**
 * Mock reviewer factory that always returns an 'approved' verdict.
 *
 * @param {{ featureId: string }} opts
 * @returns {{ run: function(): Promise<object> }}
 */
function createApproveReviewer(opts) {
  return {
    run: async () => ({
      verdict: 'approved',
      featureId: opts.featureId,
      timestamp: new Date().toISOString(),
      steps: [],
      failures: [],
      summary: `Mock scrutiny passed for ${opts.featureId}`,
      skippedDestructive: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Suite-level temp directory
// ---------------------------------------------------------------------------

describe('Cross-Area Integration', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-area-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // VAL-CROSS-001
  // ExecEngine (--auto high) triggers mission orchestrator and returns structured output
  // =========================================================================

  describe('VAL-CROSS-001: ExecEngine triggers mission orchestrator', () => {
    it('exec with --auto high starts mission, dispatches mock workers, and returns JSON result', async () => {
      // ---------------------------------------------------------------
      // Prepare source fixtures in a dedicated sub-directory
      // ---------------------------------------------------------------
      const workingDir = fs.mkdtempSync(path.join(tempDir, 'cross001-'));

      const featuresData = {
        features: [
          {
            id: 'cross-feat-a',
            description: 'First cross-area test feature',
            status: 'pending',
            milestone: 'cross-milestone',
            skillName: 'tdd',
            preconditions: [],
            verificationSteps: [],
            fulfills: [],
          },
          {
            id: 'cross-feat-b',
            description: 'Second cross-area test feature (depends on cross-feat-a)',
            status: 'pending',
            milestone: 'cross-milestone',
            skillName: 'tdd',
            preconditions: ['cross-feat-a'],
            verificationSteps: [],
            fulfills: [],
          },
        ],
      };

      const srcFeaturesPath = path.join(workingDir, 'features.json');
      writeJSON(srcFeaturesPath, featuresData);

      const missionMdPath = path.join(workingDir, 'mission.md');
      fs.writeFileSync(missionMdPath, '# Cross-Area VAL-CROSS-001 Test Mission\n', 'utf8');

      // ---------------------------------------------------------------
      // Build the _processPrompt that drives the mission orchestrator
      // ---------------------------------------------------------------

      /**
       * The injected LLM runner:  starts the orchestrator, runs mock workers,
       * and resolves once the mission is marked 'completed'.
       *
       * @param {string} _prompt
       * @param {{ toolInterceptor: function }} ctx
       * @returns {Promise<{ result: string, tokensUsed: number }>}
       */
      async function missionProcessPrompt(_prompt, ctx) {
        // The exec engine intercepts each "tool call"; here we register two
        // synthetic tool calls that --auto high permits.
        ctx.toolInterceptor('Execute'); // high tier allows Execute
        ctx.toolInterceptor('Read'); // high tier allows Read

        // 1. Start mission
        const { workspacePath } = startMission({
          featuresPath: srcFeaturesPath,
          missionPath: missionMdPath,
          workingDirectory: workingDir,
        });

        const workspaceFeaturesPath = path.join(workspacePath, 'features.json');
        const handoffsDir = path.join(workspacePath, 'handoffs');
        const progressLogPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');

        fs.mkdirSync(handoffsDir, { recursive: true });

        // 2. Set up milestone manager and progress logger
        const milestoneManager = createMilestoneManager({
          workspacePath,
          featuresPath: workspaceFeaturesPath,
        });
        const logger = createProgressLogger(progressLogPath);
        logger.log({ event: 'mission_started' });

        // 3. Friction loop (required by handoff pipeline)
        const frictionLoop = new FrictionLoopEngine({});
        frictionLoop.start();

        // 4. Handoff pipeline with mock reviewer
        const pipeline = createHandoffPipeline({
          workspacePath,
          featuresPath: workspaceFeaturesPath,
          frictionLoop,
          _reviewerFactory: createApproveReviewer,
          _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
        });

        // 5. Dispatch loop with mock db / budget
        const db = createMockDb();
        const budget = createMockBudget();
        const dispatchLoop = createDispatchLoop({
          workspacePath,
          featuresPath: workspaceFeaturesPath,
          db,
          budget,
          missionPath: missionMdPath,
          pollIntervalMs: 50,
        });

        // 6. Wire events and run until mission completes
        const completedFeatures = new Set();
        const milestoneGateChecked = new Set();

        const allFeatureIds = featuresData.features.map(f => f.id);

        const missionDone = new Promise((resolve, reject) => {
          pipeline.on('error', err => {
            if (err && err.code === 'INVALID_TRANSITION') return;
            reject(err);
          });
          dispatchLoop.on('error', reject);

          dispatchLoop.on('worker-dispatched', ({ featureId, sessionId }) => {
            logger.log({ event: 'worker_dispatched', featureId, sessionId });
            writeHandoff(handoffsDir, featureId);
            logger.log({ event: 'handoff_received', featureId });
          });

          pipeline.on('feature-completed', async ({ featureId }) => {
            try {
              completedFeatures.add(featureId);
              logger.log({ event: 'scrutiny_passed', featureId });

              if (
                allFeatureIds.every(id => completedFeatures.has(id)) &&
                !milestoneGateChecked.has('cross-milestone')
              ) {
                milestoneGateChecked.add('cross-milestone');
                await milestoneManager.checkMilestoneCompletion('cross-milestone');
                saveState(workspacePath, {
                  state: 'completed',
                  completedFeatures: allFeatureIds.length,
                });
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });
        });

        pipeline.start();
        dispatchLoop.start();

        const timeoutId = setTimeout(() => {
          dispatchLoop.stop();
          pipeline.stop();
          frictionLoop.stop();
          throw new Error('VAL-CROSS-001: mission did not complete within 8 s');
        }, 8000);

        try {
          await missionDone;
        } finally {
          clearTimeout(timeoutId);
          dispatchLoop.stop();
          pipeline.stop();
          frictionLoop.stop();
        }

        // Return structured result so the exec formatter can wrap it
        const finalState = JSON.parse(
          fs.readFileSync(path.join(workspacePath, 'state.json'), 'utf8')
        );

        return {
          result: JSON.stringify({ missionState: finalState.state, workspacePath }),
          tokensUsed: 42,
        };
      }

      // ---------------------------------------------------------------
      // Create ExecEngine with tier='high' (maps to --auto high) and run
      // ---------------------------------------------------------------
      const engine = new ExecEngine({
        tier: 'high',
        outputFormat: 'json',
        _processPrompt: missionProcessPrompt,
      });

      const execResult = await engine.run('start mission cross-area-test');

      // ---------------------------------------------------------------
      // Assertions
      // ---------------------------------------------------------------

      // (a) Exit code must be 0 (no permission violations, no unhandled errors)
      assert.strictEqual(execResult.exitCode, 0, 'ExecEngine must exit with code 0');

      // (b) tokensUsed forwarded from the mock runner
      assert.strictEqual(execResult.tokensUsed, 42, 'tokensUsed must be forwarded');

      // (c) formatted output must be valid JSON
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(execResult.formatted);
      }, 'formatted output must be valid JSON');

      // (d) formatted JSON must include exitCode and result fields
      assert.ok(
        Object.prototype.hasOwnProperty.call(parsed, 'exitCode'),
        'formatted JSON must have exitCode'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(parsed, 'result'),
        'formatted JSON must have result'
      );

      // (e) inner result must contain the completed mission state
      let innerResult;
      assert.doesNotThrow(() => {
        innerResult = JSON.parse(parsed.result);
      }, 'result field must be a JSON string');

      assert.strictEqual(
        innerResult.missionState,
        'completed',
        'Mission state must be "completed"'
      );
    });
  });

  // =========================================================================
  // VAL-CROSS-002
  // Plugin-provided skills are usable by mission workers via persona-injector
  // =========================================================================

  describe('VAL-CROSS-002: Plugin skills resolved by persona-injector', () => {
    it('installs mock plugin, references skillName, persona-injector resolves skill via PluginResolver paths', () => {
      // ---------------------------------------------------------------
      // 1. Create a mock plugin directory structure in a temp scope
      // ---------------------------------------------------------------
      const pluginScopeDir = fs.mkdtempSync(path.join(tempDir, 'cross002-scope-'));
      const pluginName = 'test-plugin';
      const skillName = 'my-custom-skill';

      // plugin layout: <scopeDir>/<pluginName>/skills/<skillName>/SKILL.md
      const pluginDir = path.join(pluginScopeDir, pluginName);
      const skillDir = path.join(pluginDir, 'skills', skillName);
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `# My Custom Skill\n\nThis is the mock plugin skill for testing VAL-CROSS-002.\n`;
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillMdPath, skillContent, 'utf8');

      // ---------------------------------------------------------------
      // 2. Wire PluginResolver → PluginLoader → getSkillSearchPaths()
      // ---------------------------------------------------------------
      const resolver = new PluginResolver({ projectDir: pluginScopeDir });
      const loader = new PluginLoader(resolver);

      // PluginResolver must be able to find the skill
      const resolved = resolver.resolveSkill(skillName);
      assert.ok(resolved !== null, 'PluginResolver must resolve the plugin skill');
      assert.strictEqual(resolved.scope, 'project', 'Skill must come from project scope');
      assert.strictEqual(resolved.plugin, pluginName, 'Skill must come from the test-plugin');
      assert.ok(resolved.path.endsWith('SKILL.md'), 'Resolved path must point to SKILL.md');

      // PluginLoader.loadSkill() must read the content
      const loaded = loader.loadSkill(skillName);
      assert.ok(loaded !== null, 'PluginLoader must load the plugin skill');
      assert.strictEqual(
        loaded.content,
        skillContent,
        'Loaded skill content must match the written SKILL.md'
      );

      // ---------------------------------------------------------------
      // 3. Build features.json that references the plugin skillName
      // ---------------------------------------------------------------
      const workingDir = fs.mkdtempSync(path.join(tempDir, 'cross002-mission-'));
      const featuresData = {
        features: [
          {
            id: 'plugin-skill-feature',
            description: 'Feature that uses a plugin-provided skill',
            status: 'pending',
            milestone: 'plugin-milestone',
            skillName,
            preconditions: [],
            verificationSteps: [],
            fulfills: [],
          },
        ],
      };

      const featuresPath = path.join(workingDir, 'features.json');
      writeJSON(featuresPath, featuresData);

      const missionMdPath = path.join(workingDir, 'mission.md');
      fs.writeFileSync(
        missionMdPath,
        '# Plugin Skill Test Mission\n## Objectives\n- Validate plugin skill resolution\n',
        'utf8'
      );

      // ---------------------------------------------------------------
      // 4. Use getSkillSearchPaths() to pass plugin skill dirs to composePersona
      // ---------------------------------------------------------------
      const skillSearchPaths = loader.getSkillSearchPaths();

      assert.ok(skillSearchPaths.length > 0, 'getSkillSearchPaths must return at least one path');
      const expectedSkillsDir = path.join(pluginDir, 'skills');
      assert.ok(
        skillSearchPaths.some(p => p === expectedSkillsDir),
        `skillSearchPaths must include the plugin's skills/ directory`
      );

      // ---------------------------------------------------------------
      // 5. composePersona resolves skill via plugin search paths
      // ---------------------------------------------------------------
      const feature = featuresData.features[0];
      const persona = composePersona({
        skillName: feature.skillName,
        skillSearchPaths,
        missionPath: missionMdPath,
        feature,
      });

      // Persona must be frozen (immutable)
      assert.ok(Object.isFrozen(persona), 'Persona object must be frozen');

      // Persona must reference the correct skillName
      assert.strictEqual(
        persona.skillName,
        skillName,
        'Persona skillName must match the plugin skill'
      );

      // Persona prompt must contain the plugin skill content
      assert.ok(
        persona.prompt.includes('My Custom Skill'),
        'Persona prompt must include the plugin skill heading'
      );

      // Persona must not have fallen back to the generic message
      assert.ok(
        !persona.prompt.includes('Generic worker - no skill template available'),
        'Persona must not use the fallback skill template'
      );

      // Feature ID must be recorded in the persona
      assert.strictEqual(persona.featureId, feature.id, 'Persona featureId must match the feature');
    });
  });

  // =========================================================================
  // VAL-CROSS-003
  // Code review runs through ExecEngine and returns structured JSON output
  // =========================================================================

  describe('VAL-CROSS-003: Code review runs through ExecEngine with JSON output', () => {
    it('exec engine runs ReviewPipeline over synthetic diff and returns structured JSON', async () => {
      // ---------------------------------------------------------------
      // Synthetic diff data (mimics computeBaseBranchDiff output)
      // ---------------------------------------------------------------
      const diffData = {
        files: [
          {
            path: 'src/feature.js',
            binary: false,
            additions: 5,
            deletions: 2,
            hunks: [
              {
                header: '@@ -10,3 +10,6 @@',
                oldStart: 10,
                oldLines: 3,
                newStart: 10,
                newLines: 6,
                lines: [
                  ' // existing line',
                  '+const foo = undefined;',
                  '+if (foo == null) { /* loose equality */ }',
                  '+foo.bar();',
                  ' // another existing line',
                ],
              },
            ],
          },
          {
            path: 'src/utils.js',
            binary: false,
            additions: 2,
            deletions: 0,
            hunks: [
              {
                header: '@@ -5,2 +5,4 @@',
                oldStart: 5,
                oldLines: 2,
                newStart: 5,
                newLines: 4,
                lines: [' // utils', '+function helper() {}', '+module.exports = { helper };'],
              },
            ],
          },
        ],
      };

      // ---------------------------------------------------------------
      // _processPrompt: run the ReviewPipeline and return JSON
      // ---------------------------------------------------------------

      /**
       * Injected LLM runner that executes ReviewPipeline over the synthetic diff.
       * Uses ctx.toolInterceptor to simulate tool calls the --auto high tier permits.
       *
       * @param {string} _prompt
       * @param {{ toolInterceptor: function }} ctx
       * @returns {Promise<{ result: string, tokensUsed: number }>}
       */
      async function reviewProcessPrompt(_prompt, ctx) {
        // Register tool calls that the high tier allows
        ctx.toolInterceptor('Read');
        ctx.toolInterceptor('Execute');

        // Run the ReviewPipeline over the synthetic diff
        const pipeline = new ReviewPipeline({
          mode: 'base-branch',
          diffData,
        });

        const reviewResult = pipeline.run();

        return {
          result: JSON.stringify(reviewResult),
          tokensUsed: 100,
        };
      }

      // ---------------------------------------------------------------
      // Create ExecEngine with --auto high and --output json
      // ---------------------------------------------------------------
      const engine = new ExecEngine({
        tier: 'high',
        outputFormat: 'json',
        _processPrompt: reviewProcessPrompt,
      });

      const execResult = await engine.run('review this PR');

      // ---------------------------------------------------------------
      // Assertions
      // ---------------------------------------------------------------

      // (a) Exit code 0
      assert.strictEqual(execResult.exitCode, 0, 'ExecEngine must exit with code 0');

      // (b) tokensUsed forwarded
      assert.strictEqual(execResult.tokensUsed, 100, 'tokensUsed must be forwarded');

      // (c) formatted output is valid JSON
      let outerJson;
      assert.doesNotThrow(() => {
        outerJson = JSON.parse(execResult.formatted);
      }, 'formatted output must be valid JSON');

      // (d) outer envelope fields
      assert.ok(
        Object.prototype.hasOwnProperty.call(outerJson, 'result'),
        'outer JSON must have result field'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(outerJson, 'exitCode'),
        'outer JSON must have exitCode field'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(outerJson, 'tokensUsed'),
        'outer JSON must have tokensUsed field'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(outerJson, 'duration'),
        'outer JSON must have duration field'
      );

      // (e) inner result is the ReviewResult from the pipeline
      let reviewResult;
      assert.doesNotThrow(() => {
        reviewResult = JSON.parse(outerJson.result);
      }, 'result field must be a parseable JSON string');

      // (f) ReviewResult shape
      assert.ok(
        Object.prototype.hasOwnProperty.call(reviewResult, 'overallAssessment'),
        'ReviewResult must have overallAssessment'
      );
      assert.ok(
        ['approve', 'request-changes', 'comment'].includes(reviewResult.overallAssessment),
        `overallAssessment must be one of approve/request-changes/comment (got "${reviewResult.overallAssessment}")`
      );

      assert.ok(Array.isArray(reviewResult.findings), 'ReviewResult must have findings array');

      assert.ok(
        Object.prototype.hasOwnProperty.call(reviewResult, 'stats'),
        'ReviewResult must have stats'
      );

      // (g) Stats are correct for the 2-file diff
      assert.strictEqual(
        reviewResult.stats.filesReviewed,
        2,
        'stats.filesReviewed must equal 2 (number of files in diffData)'
      );

      assert.ok(
        typeof reviewResult.stats.findingsCount === 'number',
        'stats.findingsCount must be a number'
      );

      // (h) Findings each have required fields
      for (const finding of reviewResult.findings) {
        assert.ok(
          typeof finding.title === 'string' && finding.title.length > 0,
          'Each finding must have a non-empty title'
        );
        assert.ok(
          ['P0', 'P1', 'P2', 'P3'].includes(finding.priority),
          `Each finding priority must be P0-P3 (got "${finding.priority}")`
        );
        assert.ok(typeof finding.file === 'string', 'Each finding must have a file field');
      }

      // (i) Metadata present
      assert.ok(
        Object.prototype.hasOwnProperty.call(reviewResult, 'metadata'),
        'ReviewResult must have metadata'
      );
      assert.strictEqual(
        reviewResult.metadata.mode,
        'base-branch',
        'metadata.mode must match the pipeline mode'
      );
      assert.ok(
        typeof reviewResult.metadata.duration === 'number',
        'metadata.duration must be a number'
      );
    });
  });
});
