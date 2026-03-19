'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AutonomousExecutor,
  Phase,
  ExitReason,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TOKEN_BUDGET,
} = require('../../.claude/lib/orchestration/autonomous-executor.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('autonomous-executor constants', () => {
  it('exports Phase enum', () => {
    assert.equal(Phase.DISCUSS, 'discuss');
    assert.equal(Phase.PLAN, 'plan');
    assert.equal(Phase.EXECUTE, 'execute');
    assert.equal(Phase.VERIFY, 'verify');
  });

  it('exports ExitReason enum', () => {
    assert.equal(ExitReason.GOAL_ACHIEVED, 'goal_achieved');
    assert.equal(ExitReason.BUDGET_EXHAUSTED, 'budget_exhausted');
    assert.equal(ExitReason.MAX_ITERATIONS, 'max_iterations');
    assert.equal(ExitReason.USER_STOPPED, 'user_stopped');
    assert.equal(ExitReason.ERROR, 'error');
  });

  it('exports default values', () => {
    assert.equal(typeof DEFAULT_MAX_ITERATIONS, 'number');
    assert.ok(DEFAULT_MAX_ITERATIONS > 0);
    assert.equal(typeof DEFAULT_TOKEN_BUDGET, 'number');
    assert.ok(DEFAULT_TOKEN_BUDGET > 0);
  });
});

// ─── Constructor ────────────────────────────────────────────────────────────

describe('AutonomousExecutor constructor', () => {
  it('creates with default options', () => {
    const exec = new AutonomousExecutor({ goal: 'test goal' });
    assert.equal(exec.goal, 'test goal');
    assert.equal(exec.maxIterations, DEFAULT_MAX_ITERATIONS);
    assert.equal(exec.tokenBudget, DEFAULT_TOKEN_BUDGET);
    assert.equal(exec.currentPhase, Phase.DISCUSS);
    assert.equal(exec.iteration, 0);
  });

  it('accepts custom options', () => {
    const exec = new AutonomousExecutor({
      goal: 'custom',
      maxIterations: 5,
      tokenBudget: 50000,
      approvalGates: { plan: true, execute: false },
    });
    assert.equal(exec.maxIterations, 5);
    assert.equal(exec.tokenBudget, 50000);
    assert.equal(exec.approvalGates.plan, true);
    assert.equal(exec.approvalGates.execute, false);
  });

  it('throws on missing goal', () => {
    assert.throws(() => new AutonomousExecutor({}), /goal/i);
  });
});

// ─── Phase transitions ─────────────────────────────────────────────────────

describe('phase transitions', () => {
  it('follows discuss -> plan -> execute -> verify cycle', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    assert.equal(exec.currentPhase, Phase.DISCUSS);

    exec.advancePhase();
    assert.equal(exec.currentPhase, Phase.PLAN);

    exec.advancePhase();
    assert.equal(exec.currentPhase, Phase.EXECUTE);

    exec.advancePhase();
    assert.equal(exec.currentPhase, Phase.VERIFY);
  });

  it('verify cycles back to discuss and increments iteration', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    assert.equal(exec.iteration, 0);

    // Complete one full cycle
    exec.advancePhase(); // plan
    exec.advancePhase(); // execute
    exec.advancePhase(); // verify
    exec.advancePhase(); // back to discuss
    assert.equal(exec.currentPhase, Phase.DISCUSS);
    assert.equal(exec.iteration, 1);
  });

  it('getPhaseOrder returns correct sequence', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    const order = exec.getPhaseOrder();
    assert.deepEqual(order, [Phase.DISCUSS, Phase.PLAN, Phase.EXECUTE, Phase.VERIFY]);
  });
});

// ─── Token budget ───────────────────────────────────────────────────────────

describe('token budget', () => {
  it('tracks consumed tokens', () => {
    const exec = new AutonomousExecutor({ goal: 'test', tokenBudget: 10000 });
    assert.equal(exec.tokensConsumed, 0);

    exec.consumeTokens(3000);
    assert.equal(exec.tokensConsumed, 3000);
    assert.equal(exec.tokensRemaining, 7000);
  });

  it('detects budget exhaustion', () => {
    const exec = new AutonomousExecutor({ goal: 'test', tokenBudget: 5000 });
    exec.consumeTokens(5000);
    assert.equal(exec.isBudgetExhausted(), true);
  });

  it('budget not exhausted when tokens remain', () => {
    const exec = new AutonomousExecutor({ goal: 'test', tokenBudget: 5000 });
    exec.consumeTokens(4999);
    assert.equal(exec.isBudgetExhausted(), false);
  });
});

// ─── Iteration limit ────────────────────────────────────────────────────────

describe('iteration limit', () => {
  it('detects max iterations reached', () => {
    const exec = new AutonomousExecutor({ goal: 'test', maxIterations: 2 });
    exec.iteration = 2;
    assert.equal(exec.isMaxIterationsReached(), true);
  });

  it('not reached when under limit', () => {
    const exec = new AutonomousExecutor({ goal: 'test', maxIterations: 3 });
    exec.iteration = 2;
    assert.equal(exec.isMaxIterationsReached(), false);
  });
});

// ─── Approval gates ─────────────────────────────────────────────────────────

describe('approval gates', () => {
  it('no gates required by default', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    assert.equal(exec.needsApproval(Phase.DISCUSS), false);
    assert.equal(exec.needsApproval(Phase.PLAN), false);
    assert.equal(exec.needsApproval(Phase.EXECUTE), false);
    assert.equal(exec.needsApproval(Phase.VERIFY), false);
  });

  it('reports gate requirement when configured', () => {
    const exec = new AutonomousExecutor({
      goal: 'test',
      approvalGates: { plan: true, execute: true },
    });
    assert.equal(exec.needsApproval(Phase.PLAN), true);
    assert.equal(exec.needsApproval(Phase.EXECUTE), true);
    assert.equal(exec.needsApproval(Phase.DISCUSS), false);
  });
});

// ─── shouldContinue ─────────────────────────────────────────────────────────

describe('shouldContinue', () => {
  it('returns continue=true when no limits hit', () => {
    const exec = new AutonomousExecutor({ goal: 'test', maxIterations: 10, tokenBudget: 100000 });
    const result = exec.shouldContinue();
    assert.equal(result.continue, true);
  });

  it('returns continue=false with BUDGET_EXHAUSTED', () => {
    const exec = new AutonomousExecutor({ goal: 'test', tokenBudget: 100 });
    exec.consumeTokens(100);
    const result = exec.shouldContinue();
    assert.equal(result.continue, false);
    assert.equal(result.reason, ExitReason.BUDGET_EXHAUSTED);
  });

  it('returns continue=false with MAX_ITERATIONS', () => {
    const exec = new AutonomousExecutor({ goal: 'test', maxIterations: 1 });
    exec.iteration = 1;
    const result = exec.shouldContinue();
    assert.equal(result.continue, false);
    assert.equal(result.reason, ExitReason.MAX_ITERATIONS);
  });

  it('returns continue=false when goal marked achieved', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    exec.markGoalAchieved('All tests pass');
    const result = exec.shouldContinue();
    assert.equal(result.continue, false);
    assert.equal(result.reason, ExitReason.GOAL_ACHIEVED);
  });

  it('returns continue=false when stopped', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    exec.stop();
    const result = exec.shouldContinue();
    assert.equal(result.continue, false);
    assert.equal(result.reason, ExitReason.USER_STOPPED);
  });
});

// ─── Status snapshot ────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('returns complete status snapshot', () => {
    const exec = new AutonomousExecutor({
      goal: 'implement auth',
      maxIterations: 5,
      tokenBudget: 50000,
    });
    exec.consumeTokens(10000);
    exec.advancePhase(); // plan

    const status = exec.getStatus();
    assert.equal(status.goal, 'implement auth');
    assert.equal(status.currentPhase, Phase.PLAN);
    assert.equal(status.iteration, 0);
    assert.equal(status.maxIterations, 5);
    assert.equal(status.tokensConsumed, 10000);
    assert.equal(status.tokensRemaining, 40000);
    assert.equal(status.tokenBudget, 50000);
    assert.equal(status.goalAchieved, false);
    assert.equal(status.stopped, false);
  });
});

// ─── Phase history ──────────────────────────────────────────────────────────

describe('phase history', () => {
  it('records phase transitions', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    exec.advancePhase(); // plan
    exec.advancePhase(); // execute

    const history = exec.getPhaseHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].from, Phase.DISCUSS);
    assert.equal(history[0].to, Phase.PLAN);
    assert.equal(history[1].from, Phase.PLAN);
    assert.equal(history[1].to, Phase.EXECUTE);
  });

  it('history includes timestamp', () => {
    const exec = new AutonomousExecutor({ goal: 'test' });
    exec.advancePhase();
    const history = exec.getPhaseHistory();
    assert.equal(typeof history[0].timestamp, 'number');
    assert.ok(history[0].timestamp > 0);
  });
});
