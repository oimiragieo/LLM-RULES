const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const nodePath = require('node:path');
const test = require('node:test');

const shared = require('../../.claude/hooks/routing/routing-guard-core.shared.cjs');
const checksTask = require('../../.claude/hooks/routing/routing-guard-core.checks-task.cjs');
const checksRouter = require('../../.claude/hooks/routing/routing-guard-core.checks-router.cjs');
const routingGuard = require('../../.claude/hooks/routing/routing-guard-core.impl.cjs');
const preTask = require('../../.claude/hooks/routing/pre-task-unified-core.cjs');
const policy = require('../../.claude/hooks/routing/routing-guard-core.policy.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

const PROJECT_ROOT = nodePath.resolve(__dirname, '..', '..');

function useTempRouterState(t) {
  const tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'routing-enforcement-'));
  const stateFile = nodePath.join(tmpDir, 'router-state.json');
  const dedupeFile = nodePath.join(tmpDir, 'routing-block-dedupe.json');
  const savedEnv = {
    ROUTER_STATE_FILE: process.env.ROUTER_STATE_FILE,
    ROUTING_BLOCK_DEDUPE_PATH: process.env.ROUTING_BLOCK_DEDUPE_PATH,
    CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
    ROUTING_GUARD_TASK_CHECKS: process.env.ROUTING_GUARD_TASK_CHECKS,
    ROUTER_READ_GOVERNANCE: process.env.ROUTER_READ_GOVERNANCE,
    PLANNER_FIRST_ENFORCEMENT: process.env.PLANNER_FIRST_ENFORCEMENT,
    SECURITY_REVIEW_ENFORCEMENT: process.env.SECURITY_REVIEW_ENFORCEMENT,
    CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT:
      process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT,
    HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT:
      process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT,
    SPECIALIST_ROUTING_ENFORCEMENT: process.env.SPECIALIST_ROUTING_ENFORCEMENT,
    TASKLIST_FIRST_ENFORCEMENT: process.env.TASKLIST_FIRST_ENFORCEMENT,
  };

  process.env.ROUTER_STATE_FILE = stateFile;
  process.env.ROUTING_BLOCK_DEDUPE_PATH = dedupeFile;
  process.env.CLAUDE_SESSION_ID = `routing-enforcement-${Date.now()}-${Math.random()}`;

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  const resetCaches = () => {
    routerState.invalidateStateCache();
    shared.invalidateCachedState();
    shared.resetBlockDedupeState();
  };

  const setState = updates => {
    fs.mkdirSync(nodePath.dirname(stateFile), { recursive: true });
    const nextState = { ...routerState.getState(), ...updates };
    fs.writeFileSync(stateFile, JSON.stringify(nextState));
    resetCaches();
  };

  t.after(() => {
    restoreEnv();
    resetCaches();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  resetCaches();

  return { stateFile, setState, resetCaches };
}

test('shouldAutoReroute supports named checks and never reroutes safety-critical checks', () => {
  assert.equal(shared.shouldAutoReroute('block', 3, 3, 'true'), true);
  assert.equal(shared.shouldAutoReroute('intent-agent-match', 'block', 3, 3, 'true'), true);
  assert.equal(shared.shouldAutoReroute('checkPlannerFirst', 'block', 99, 3, 'true'), false);
  assert.equal(shared.shouldAutoReroute('checkSecurityReview', 'block', 99, 3, 'true'), false);
  assert.equal(
    shared.shouldAutoReroute('checkSpecialistOverride', 'block', 99, 3, 'true'),
    false
  );
});

test('safety-critical block messages include the recommended agent name', t => {
  const ctx = useTempRouterState(t);
  process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
  process.env.SECURITY_REVIEW_ENFORCEMENT = 'block';
  process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';

  ctx.setState({
    mode: 'router',
    taskSpawned: false,
    requiresPlannerFirst: true,
    plannerSpawned: false,
    requiresSecurityReview: true,
    securitySpawned: false,
  });

  const plannerResult = checksTask.checkPlannerFirst('Task', {
    subagent_type: 'developer',
    prompt: 'Implement a multi-step feature',
  });
  assert.equal(plannerResult.pass, false);
  assert.match(plannerResult.message, /\bPLANNER\b/);

  const securityResult = checksTask.checkSecurityReview('Task', {
    subagent_type: 'developer',
    prompt: 'You are developer. Add authentication logic.',
  });
  assert.equal(securityResult.pass, false);
  assert.match(securityResult.message, /\bSECURITY-ARCHITECT\b/);

  const specialistResult = checksTask.checkSpecialistOverride('Task', {
    subagent_type: 'developer',
    prompt: 'You are a developer. update documentation for the API',
  });
  assert.equal(specialistResult.pass, false);
  assert.match(specialistResult.message, /\btechnical-writer\b/i);
});

test('delegate mode leaves planner, security, and architect enforcement to pre-task-unified', async t => {
  const ctx = useTempRouterState(t);
  delete process.env.ROUTING_GUARD_TASK_CHECKS;
  process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
  process.env.SECURITY_REVIEW_ENFORCEMENT = 'block';
  process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT = 'block';
  process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT = 'block';
  process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

  await t.test('planner-first is enforced only by pre-task-unified', async () => {
    ctx.setState({
      mode: 'router',
      taskSpawned: false,
      taskListCalledSincePrompt: true,
      requiresPlannerFirst: true,
      plannerSpawned: false,
      complexity: 'high',
    });

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the feature.',
      description: 'Implement the feature',
    };

    const guardResult = routingGuard.runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    assert.equal(guardResult.pass, true);

    const preTaskResult = await preTask.checkRoutingGuard('Task', toolInput, {
      session_id: process.env.CLAUDE_SESSION_ID,
    });
    assert.equal(preTaskResult.pass, false);
    assert.match(preTaskResult.message, /\bPLANNER\b/);
  });

  await t.test('security review is enforced only by pre-task-unified', async () => {
    ctx.setState({
      mode: 'router',
      taskSpawned: false,
      taskListCalledSincePrompt: true,
      requiresPlannerFirst: false,
      plannerSpawned: false,
      requiresSecurityReview: true,
      securitySpawned: false,
    });

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement auth flow.',
      description: 'Implement auth flow',
    };

    const guardResult = routingGuard.runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    assert.equal(guardResult.pass, true);

    const preTaskResult = await preTask.checkRoutingGuard('Task', toolInput, {
      session_id: process.env.CLAUDE_SESSION_ID,
    });
    assert.equal(preTaskResult.pass, false);
    assert.match(preTaskResult.message, /\bSECURITY-ARCHITECT\b/);
  });

  await t.test('architect review is enforced only by pre-task-unified', async () => {
    ctx.setState({
      mode: 'router',
      taskSpawned: false,
      taskListCalledSincePrompt: true,
      requiresPlannerFirst: false,
      plannerSpawned: false,
      requiresSecurityReview: false,
      securitySpawned: false,
      architectSpawned: false,
    });

    const toolInput = {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Refactor the implementation.',
      description: 'Refactor the implementation',
    };

    const guardResult = routingGuard.runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    assert.equal(guardResult.pass, true);

    const preTaskResult = await preTask.checkRoutingGuard('Task', toolInput, {
      session_id: process.env.CLAUDE_SESSION_ID,
    });
    assert.equal(preTaskResult.pass, false);
    assert.match(preTaskResult.message, /\bARCHITECT\b/);
  });
});

test('force mode makes routing-guard the single owner for planner and architect checks', async t => {
  const ctx = useTempRouterState(t);
  process.env.ROUTING_GUARD_TASK_CHECKS = 'force';
  process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
  process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT = 'block';
  process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

  await t.test('planner-first blocks in routing-guard and is skipped in pre-task-unified', async () => {
    ctx.setState({
      mode: 'router',
      taskSpawned: false,
      taskListCalledSincePrompt: true,
      requiresPlannerFirst: true,
      plannerSpawned: false,
      complexity: 'high',
    });

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the feature.',
      description: 'Implement the feature',
    };

    const guardResult = routingGuard.runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    assert.equal(guardResult.pass, false);
    assert.equal(guardResult.checkName, 'planner-first-guard');

    const preTaskResult = await preTask.checkRoutingGuard('Task', toolInput, {
      session_id: process.env.CLAUDE_SESSION_ID,
    });
    assert.equal(preTaskResult.pass, true);
  });

  await t.test('architect review blocks in routing-guard and is skipped in pre-task-unified', async () => {
    ctx.setState({
      mode: 'router',
      taskSpawned: false,
      taskListCalledSincePrompt: true,
      requiresPlannerFirst: false,
      plannerSpawned: false,
      architectSpawned: false,
    });

    const toolInput = {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Refactor the implementation.',
      description: 'Refactor the implementation',
    };

    const guardResult = routingGuard.runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    assert.equal(guardResult.pass, false);
    assert.equal(guardResult.checkName, 'code-simplifier-architect-guard');

    const preTaskResult = await preTask.checkRoutingGuard('Task', toolInput, {
      session_id: process.env.CLAUDE_SESSION_ID,
    });
    assert.equal(preTaskResult.pass, true);
  });
});

test('router read governance allows documented router reads and gap logging bash command', t => {
  const ctx = useTempRouterState(t);
  process.env.ROUTER_READ_GOVERNANCE = 'block';

  ctx.setState({
    mode: 'router',
    taskSpawned: false,
  });

  const documentedPaths = [
    '.claude/agents/core/planner.md',
    '.claude/workflows/core/router-decision.md',
    '.claude/docs/ARCHITECTURE.md',
    '.claude/context/artifacts/catalogs/agent-index.json',
    '.claude/context/agent-registry.json',
    '.claude/context/memory/decisions.md',
    '.claude/context/runtime/reflection-latest.txt',
    '.claude/context/runtime/reflection-spawn-request.json',
    '.claude/context/runtime/integration-queue.jsonl',
    '.claude/context/runtime/heartbeat-reminder.txt',
    '.claude/context/runtime/pipeline-obligations-reminder.txt',
  ];

  for (const filePath of documentedPaths) {
    const result = checksRouter.checkRouterReadGovernance('Read', { file_path: filePath });
    assert.equal(result.pass, true, `Expected documented router read to pass: ${filePath}`);
  }

  const absoluteAgentPath = nodePath.join(PROJECT_ROOT, '.claude', 'agents', 'core', 'planner.md');
  assert.equal(
    checksRouter.checkRouterReadGovernance('Read', { file_path: absoluteAgentPath }).pass,
    true
  );

  const blockedResult = checksRouter.checkRouterReadGovernance('Read', {
    file_path: '.claude/CLAUDE.md',
  });
  assert.equal(blockedResult.pass, false);

  assert.equal(
    policy.isWhitelistedBashCommand(
      "echo 'router-gap' >> .claude/context/runtime/session-gap-log.jsonl"
    ),
    true
  );
});
