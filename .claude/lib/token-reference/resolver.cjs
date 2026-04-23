#!/usr/bin/env node
/**
 * Token Reference Resolver (TR-001)
 * ===================================
 *
 * Resolves `{skill.<name>}`, `{agent.<name>}`, and `{hook.<name>}` reference
 * tokens embedded in strings and objects. Intended to be called at skill-index
 * regeneration time so agent manifests can reference skills/agents/hooks by
 * logical name without hard-coding filesystem paths.
 *
 * Design constraints:
 *   - Pure function — no filesystem access; callers pass registries
 *   - Flat (single-pass) resolution — prevents infinite loops
 *   - Unknown references preserved as-is + warnings recorded (not thrown)
 *   - Case-sensitive matching
 *   - Recognized prefixes: skill, agent, hook
 *   - Unrecognized prefixes (e.g. {foo.bar}) left unchanged
 *
 * Usage:
 *   const { resolveTokenReferences } = require('./resolver.cjs');
 *
 *   const registry = {
 *     skills: { tdd: 'tdd', ripgrep: 'ripgrep' },
 *     agents: { developer: 'developer' },
 *     hooks: { 'pre-tool-use': 'pre-tool-use' },
 *   };
 *
 *   const result = resolveTokenReferences('{skill.tdd}', registry);
 *   // => { resolved: 'tdd', warnings: [] }
 */

'use strict';

/** Recognized token prefixes mapped to registry keys */
const KNOWN_PREFIXES = ['skill', 'agent', 'hook'];

/** Regex that matches {prefix.name} tokens — single flat pass */
const TOKEN_RE = /\{(skill|agent|hook)\.([^}]+)\}/g;

/**
 * Resolve token references within a single string.
 *
 * @param {string} input         — String potentially containing tokens
 * @param {object} registry      — { skills, agents, hooks } maps of name → id/path
 * @param {string[]} warningsOut — Mutable array; warnings appended here
 * @returns {string}             — String with resolved tokens (flat, single-pass)
 */
function resolveString(input, registry, warningsOut) {
  if (typeof input !== 'string') return input;

  // Single-pass replacement: process known prefixes
  const result = input.replace(TOKEN_RE, (_match, prefix, name) => {
    const regKey = prefix + 's'; // skill→skills, agent→agents, hook→hooks
    const registrySection = registry[regKey];
    if (registrySection && Object.prototype.hasOwnProperty.call(registrySection, name)) {
      return registrySection[name];
    }
    warningsOut.push(
      `Unresolvable token: {${prefix}.${name}} — "${name}" not found in ${regKey} registry`
    );
    return _match; // preserve literal
  });

  return result;
}

/**
 * Recursively resolve token references in a string, plain object, or array.
 * Objects and arrays are traversed depth-first (single-pass per leaf string).
 * Does NOT mutate the original input — returns a new value.
 *
 * @param {*} input      — String, object, or array (other primitives pass through)
 * @param {object} registry
 *   @param {object} [registry.skills]  — Map of skill name → resolved id/path
 *   @param {object} [registry.agents]  — Map of agent name → resolved id/path
 *   @param {object} [registry.hooks]   — Map of hook name → resolved id/path
 * @returns {{ resolved: *, warnings: string[] }}
 */
function resolveTokenReferences(input, registry = {}) {
  const warnings = [];

  function walk(value) {
    if (typeof value === 'string') {
      return resolveString(value, registry, warnings);
    }
    if (Array.isArray(value)) {
      return value.map(item => walk(item));
    }
    if (value !== null && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = walk(value[key]);
      }
      return out;
    }
    // Primitives (number, boolean, null, undefined) pass through unchanged
    return value;
  }

  const resolved = walk(input);
  return { resolved, warnings };
}

/**
 * Scan an agent manifest's skills[] array for unresolvable {skill.*} tokens.
 * Read-only audit — does not mutate the manifest.
 *
 * @param {string} agentId    — Agent identifier for warning messages
 * @param {string[]} skills   — Agent's skills array
 * @param {object} skillsReg  — Skills registry (name → id)
 * @returns {string[]}        — Warning messages for any unresolvable tokens
 */
function auditAgentSkillRefs(agentId, skills, skillsReg) {
  if (!Array.isArray(skills)) return [];
  const warnings = [];
  for (const entry of skills) {
    if (typeof entry !== 'string') continue;
    const matches = [...entry.matchAll(/\{skill\.([^}]+)\}/g)];
    for (const [, name] of matches) {
      if (!skillsReg || !Object.prototype.hasOwnProperty.call(skillsReg, name)) {
        warnings.push(`Agent "${agentId}": unresolvable {skill.${name}} in skills[] array`);
      }
    }
  }
  return warnings;
}

module.exports = {
  resolveTokenReferences,
  auditAgentSkillRefs,
  // Export internals for testing
  _resolveString: resolveString,
  _KNOWN_PREFIXES: KNOWN_PREFIXES,
};
