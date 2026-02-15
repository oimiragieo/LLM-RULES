'use strict';

function withRouterState(deps, routerStatePath, state, fn) {
  const { fs, path, routerState, atomicWriteJSONSync } = deps;
  const existed = fs.existsSync(routerStatePath);
  const prior = existed ? fs.readFileSync(routerStatePath, 'utf8') : null;
  try {
    fs.mkdirSync(path.dirname(routerStatePath), { recursive: true });
    atomicWriteJSONSync(routerStatePath, state);
    routerState.invalidateStateCache();
    fn();
  } finally {
    if (existed) {
      fs.writeFileSync(routerStatePath, prior, 'utf8');
    } else {
      fs.rmSync(routerStatePath, { force: true });
    }
    routerState.invalidateStateCache();
  }
}

function withMockedRouterSnapshot(routerState, snapshot, fn) {
  const priorGetState = routerState.getState;
  const priorGetLastTaskUpdate = routerState.getLastTaskUpdate;
  const priorWasTaskUpdateCalledRecently = routerState.wasTaskUpdateCalledRecently;
  try {
    routerState.getState = () => snapshot;
    routerState.getLastTaskUpdate = () => ({
      timestamp: snapshot.lastTaskUpdateCall,
      taskId: snapshot.lastTaskUpdateTaskId,
      status: snapshot.lastTaskUpdateStatus,
    });
    routerState.wasTaskUpdateCalledRecently = () =>
      Number(snapshot.lastTaskUpdateCall || 0) > Date.now() - 60_000;
    fn();
  } finally {
    routerState.getState = priorGetState;
    routerState.getLastTaskUpdate = priorGetLastTaskUpdate;
    routerState.wasTaskUpdateCalledRecently = priorWasTaskUpdateCalledRecently;
  }
}

function withTempStateFile(deps, fn) {
  const { fs, path, os } = deps;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskupdate-first-'));
  const stateFile = path.join(tempDir, 'state.json');
  const priorMode = process.env.TASKUPDATE_FIRST_ENFORCEMENT;
  const priorAutoMark = process.env.TASKUPDATE_FIRST_AUTOMARK;
  const priorSelfHeal = process.env.TASKUPDATE_FIRST_SELF_HEAL;
  const priorSessionId = process.env.CLAUDE_SESSION_ID;
  const priorBootstrap = process.env.TASKUPDATE_FIRST_BOOTSTRAP;
  process.env.TASKUPDATE_FIRST_ENFORCEMENT = 'block';
  process.env.TASKUPDATE_FIRST_AUTOMARK = 'off';
  process.env.TASKUPDATE_FIRST_SELF_HEAL = 'off';
  process.env.TASKUPDATE_FIRST_BOOTSTRAP = 'off';
  delete process.env.CLAUDE_SESSION_ID;
  try {
    fn(stateFile);
  } finally {
    if (priorMode == null) {
      delete process.env.TASKUPDATE_FIRST_ENFORCEMENT;
    } else {
      process.env.TASKUPDATE_FIRST_ENFORCEMENT = priorMode;
    }
    if (priorAutoMark == null) {
      delete process.env.TASKUPDATE_FIRST_AUTOMARK;
    } else {
      process.env.TASKUPDATE_FIRST_AUTOMARK = priorAutoMark;
    }
    if (priorSelfHeal == null) {
      delete process.env.TASKUPDATE_FIRST_SELF_HEAL;
    } else {
      process.env.TASKUPDATE_FIRST_SELF_HEAL = priorSelfHeal;
    }
    if (priorSessionId == null) {
      delete process.env.CLAUDE_SESSION_ID;
    } else {
      process.env.CLAUDE_SESSION_ID = priorSessionId;
    }
    if (priorBootstrap == null) {
      delete process.env.TASKUPDATE_FIRST_BOOTSTRAP;
    } else {
      process.env.TASKUPDATE_FIRST_BOOTSTRAP = priorBootstrap;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { withMockedRouterSnapshot, withRouterState, withTempStateFile };
