'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  PauseResumeController,
  PipelineState,
} = require('../../.claude/lib/orchestration/pause-resume.cjs');

// ─── PipelineState ──────────────────────────────────────────────────────────

describe('PipelineState', () => {
  it('exports state values', () => {
    assert.equal(PipelineState.RUNNING, 'running');
    assert.equal(PipelineState.PAUSED, 'paused');
    assert.equal(PipelineState.STOPPED, 'stopped');
    assert.equal(PipelineState.COMPLETED, 'completed');
  });
});

// ─── PauseResumeController ──────────────────────────────────────────────────

describe('PauseResumeController', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new PauseResumeController('pipeline-1');
  });

  it('creates in RUNNING state', () => {
    assert.equal(ctrl.getState(), PipelineState.RUNNING);
    assert.equal(ctrl.pipelineId, 'pipeline-1');
  });

  it('pause transitions to PAUSED', () => {
    ctrl.pause('user requested');
    assert.equal(ctrl.getState(), PipelineState.PAUSED);
  });

  it('resume transitions back to RUNNING', () => {
    ctrl.pause();
    ctrl.resume();
    assert.equal(ctrl.getState(), PipelineState.RUNNING);
  });

  it('resume from RUNNING is no-op', () => {
    ctrl.resume();
    assert.equal(ctrl.getState(), PipelineState.RUNNING);
  });

  it('stop transitions to STOPPED', () => {
    ctrl.stop('budget exhausted');
    assert.equal(ctrl.getState(), PipelineState.STOPPED);
  });

  it('cannot resume from STOPPED', () => {
    ctrl.stop();
    ctrl.resume();
    assert.equal(ctrl.getState(), PipelineState.STOPPED);
  });

  it('cannot resume from COMPLETED', () => {
    ctrl.complete();
    ctrl.resume();
    assert.equal(ctrl.getState(), PipelineState.COMPLETED);
  });

  it('complete transitions to COMPLETED', () => {
    ctrl.complete();
    assert.equal(ctrl.getState(), PipelineState.COMPLETED);
  });

  it('isPaused returns correct boolean', () => {
    assert.equal(ctrl.isPaused(), false);
    ctrl.pause();
    assert.equal(ctrl.isPaused(), true);
    ctrl.resume();
    assert.equal(ctrl.isPaused(), false);
  });

  it('isActive returns true for RUNNING', () => {
    assert.equal(ctrl.isActive(), true);
    ctrl.pause();
    assert.equal(ctrl.isActive(), false);
    ctrl.resume();
    assert.equal(ctrl.isActive(), true);
  });

  it('records pause reason', () => {
    ctrl.pause('user break');
    const status = ctrl.getStatus();
    assert.equal(status.pauseReason, 'user break');
  });

  it('records stop reason', () => {
    ctrl.stop('max iterations');
    const status = ctrl.getStatus();
    assert.equal(status.stopReason, 'max iterations');
  });

  it('tracks pause count', () => {
    ctrl.pause();
    ctrl.resume();
    ctrl.pause();
    ctrl.resume();
    const status = ctrl.getStatus();
    assert.equal(status.pauseCount, 2);
  });

  it('getStatus returns full snapshot', () => {
    ctrl.pause('test');
    const status = ctrl.getStatus();
    assert.equal(status.pipelineId, 'pipeline-1');
    assert.equal(status.state, PipelineState.PAUSED);
    assert.equal(typeof status.createdAt, 'number');
    assert.equal(typeof status.lastTransitionAt, 'number');
  });

  it('tracks state history', () => {
    ctrl.pause();
    ctrl.resume();
    ctrl.complete();
    const history = ctrl.getHistory();
    assert.equal(history.length, 3);
    assert.equal(history[0].to, PipelineState.PAUSED);
    assert.equal(history[1].to, PipelineState.RUNNING);
    assert.equal(history[2].to, PipelineState.COMPLETED);
  });
});
