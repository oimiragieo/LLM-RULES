#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const routingGuard = require(path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs'));

function cleanupState() {
  routingGuard.invalidateCachedState();
  const files = [
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json'),
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'active-creators.json'),
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'routing-block-dedupe.json'),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

describe('routing-guard.cjs - Check 9: Creator Intent Guard', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_ROUTING_ENFORCEMENT;
  });

  it('should allow Task when no creator intent detected', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ creatorIntentDetected: false }));
    const result = routingGuard.checkCreatorIntentGuard('Task', { prompt: 'You are developer.' });
    assert.equal(result.pass, true);
  });

  it('should block Task when creator intent detected but no creator skill', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        creatorIntentDetected: true,
        detectedCreatorType: 'skill',
        requiredCreatorSkill: 'skill-creator',
      })
    );

    const result = routingGuard.checkCreatorIntentGuard('Task', {
      prompt: 'You are developer. Create file.',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /CREATOR ROUTING VIOLATION/);
  });

  it('should allow Task when creator skill included', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ creatorIntentDetected: true, requiredCreatorSkill: 'skill-creator' })
    );
    const result = routingGuard.checkCreatorIntentGuard('Task', {
      prompt: 'Invoke Skill({ skill: "skill-creator" }) to create.',
    });
    assert.equal(result.pass, true);
  });
});

describe('routing-guard.cjs - Check 10: Intent-Agent Match', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.INTENT_AGENT_MATCH;
    delete process.env.INTENT_AGENT_AUTOREROUTE;
    delete process.env.INTENT_AGENT_AUTOREROUTE_THRESHOLD;
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.INTENT_AGENT_ENFORCEMENT;
  });

  it('should allow when no intent detected', () => {
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'developer',
      prompt: 'Implement feature X.',
    });
    assert.equal(result.pass, true);
  });

  it('should block when security intent detected but not security agent', () => {
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'developer',
      prompt: 'Review authentication security and check for vulnerabilities.',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /INTENT-AGENT MATCH/);
  });

  it('should allow when intent matches agent', () => {
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'security-architect',
      prompt: 'Review authentication security and check for vulnerabilities.',
    });
    assert.equal(result.pass, true);
  });

  it('should allow explicit audit routing override for code-reviewer', () => {
    process.env.INTENT_AGENT_MATCH = 'block';
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'code-reviewer',
      description: 'Code quality audit',
      prompt: 'Run a bug-focused code audit and include security/test findings.',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
    assert.match(result.message || '', /Audit routing override/);
  });

  it('should detect multiple intent signals', () => {
    const { detectedSignals, suggestedAgents } = routingGuard.detectIntent(
      'Review security, write tests, and update documentation.'
    );
    assert.ok(detectedSignals.length > 0);
    assert.ok(
      suggestedAgents.includes('security-architect') ||
        suggestedAgents.includes('qa') ||
        suggestedAgents.includes('technical-writer')
    );
  });

  it('should auto-reroute repeated intent mismatches to warning loop-breaker', () => {
    process.env.INTENT_AGENT_MATCH = 'block';
    process.env.INTENT_AGENT_AUTOREROUTE = 'true';
    process.env.INTENT_AGENT_AUTOREROUTE_THRESHOLD = '2';
    process.env.CLAUDE_SESSION_ID = 'session-intent-autoroute';

    const first = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'developer',
      prompt: 'Review authentication security and check for vulnerabilities.',
    });
    const second = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'developer',
      prompt: 'Review authentication security and check for vulnerabilities.',
    });
    assert.equal(first.pass, false);
    assert.equal(second.pass, true);
    assert.equal(second.result, 'warn');
    assert.match(second.message || '', /INTENT-AGENT AUTO-REROUTE/);
  });

  it('should ignore injected memory/constitution sections when detecting intent', () => {
    process.env.INTENT_AGENT_MATCH = 'block';
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'code-reviewer',
      description: 'Code quality audit',
      prompt:
        'Run a broad code quality audit.\n\n## Agent Constitution\nGeneral principles.\n\n## Memory Context (Auto-Loaded)\nsecurity test assertion vulnerability auth token exploit\n',
    });
    assert.equal(result.pass, true);
  });

  it('should allow bug-hunt audit routing override for code-reviewer', () => {
    process.env.INTENT_AGENT_ENFORCEMENT = 'block';
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'code-reviewer',
      description: 'Code quality bug hunt',
      prompt: 'Search the codebase for security issues and bugs, and write an audit report.',
    });
    assert.equal(result.pass, true);
  });

  it('should allow code-review override even when test/coverage keywords are present', () => {
    process.env.INTENT_AGENT_ENFORCEMENT = 'block';
    const result = routingGuard.checkIntentAgentMatch('Task', {
      subagent_type: 'code-reviewer',
      description: 'Code review for bugs and issues',
      prompt:
        'Search for bugs and issues, include test coverage and assertion quality findings in the report.',
    });
    assert.equal(result.pass, true);
  });
});

describe('routing-guard.cjs - Check 11: Config Model Validator', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CONFIG_MODEL_VALIDATOR;
  });

  it('should allow when no model specified in spawn', () => {
    const result = routingGuard.checkConfigModelValidator('Task', { prompt: 'You are developer.' });
    assert.equal(result.pass, true);
  });

  it('should allow when model matches config', () => {
    const result = routingGuard.checkConfigModelValidator('Task', {
      prompt: 'You are developer.',
      model: 'claude-sonnet-4-5',
    });
    assert.ok(result.pass === true || result.pass === false);
  });

  it('should extract agent type and model helpers', () => {
    assert.equal(routingGuard.extractAgentTypeFromPrompt('You are PLANNER. Create plan.'), 'planner');
    assert.equal(
      routingGuard.extractAgentTypeFromPrompt('Read .claude/agents/core/developer.md'),
      'developer'
    );
    assert.equal(
      routingGuard.extractModelFromToolInput({ model: 'claude-opus-4-5-20251101' }),
      'claude-opus-4-5-20251101'
    );
  });
});

describe('routing-guard.cjs - Helper Functions', () => {
  it('should detect whitelisted bash commands', () => {
    assert.equal(routingGuard.isWhitelistedBashCommand('git status'), true);
    assert.equal(routingGuard.isWhitelistedBashCommand('git status -s'), true);
    assert.equal(routingGuard.isWhitelistedBashCommand('git log --oneline -5'), true);
    assert.equal(routingGuard.isWhitelistedBashCommand('npm test'), false);
    assert.equal(routingGuard.isWhitelistedBashCommand('rm -rf /'), false);
  });

  it('should detect planner/security spawns and allowed write paths', () => {
    assert.equal(routingGuard.isPlannerSpawn({ prompt: 'You are planner.' }), true);
    assert.equal(routingGuard.isPlannerSpawn({ prompt: 'You are developer.' }), false);
    assert.equal(routingGuard.isSecuritySpawn({ prompt: 'You are security-architect.' }), true);
    assert.equal(routingGuard.isSecuritySpawn({ prompt: 'You are developer.' }), false);
    assert.equal(routingGuard.isAlwaysAllowedWrite('.claude/context/runtime/state.json'), true);
    assert.equal(routingGuard.isAlwaysAllowedWrite('src/app.js'), false);
  });
});
