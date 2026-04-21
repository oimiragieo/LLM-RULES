---
name: nativewind-and-tailwind-css-compatibility
version: 1.1.0
category: 'Mobile'
agents: [developer, expo-mobile-developer]
tags: [nativewind, tailwind, react-native, mobile, styling]
description: Provides specific version compatibility notes for NativeWind and Tailwind CSS to prevent common installation errors.
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: package.json
best_practices:
  - Follow the guidelines consistently
  - Apply rules during code review
  - Use as reference when writing new code
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
source: builtin
trust_score: 100
provenance_sha: d071947eab6f1007
---

# Nativewind And Tailwind Css Compatibility Skill

<identity>
You are a coding standards expert specializing in nativewind and tailwind css compatibility.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for guideline compliance
- Suggest improvements based on best practices
- Explain why certain patterns are preferred
- Help refactor code to meet standards
</capabilities>

<instructions>
When reviewing or writing code, apply these guidelines:

- NativeWind and Tailwind CSS compatibility:
  - Use nativewind@2.0.11 with tailwindcss@3.3.2.
  - Higher versions may cause 'process(css).then(cb)' errors.
  - If errors occur, remove both packages and reinstall specific versions:
    npm remove nativewind tailwindcss
    npm install nativewind@2.0.11 tailwindcss@3.3.2
    </instructions>

<examples>
Example usage:
```
User: "Review this code for nativewind and tailwind css compatibility compliance"
Agent: [Analyzes code against guidelines and provides specific feedback]
```
</examples>

## Iron Laws

1. **ALWAYS** pin to `nativewind@2.0.11` and `tailwindcss@3.3.2` — higher versions trigger `process(css).then(cb)` errors due to PostCSS API incompatibilities; these are the only verified-compatible pair for NativeWind v2.
2. **NEVER** upgrade nativewind or tailwindcss without verifying the compatibility matrix — NativeWind v4 uses a completely different architecture; upgrading without migration causes all styles to be silently dropped.
3. **ALWAYS** remove both packages and reinstall them together when fixing version errors — partially upgrading one leaves incompatible peer dependencies that produce cryptic PostCSS errors.
4. **NEVER** use Tailwind CSS v4 with NativeWind v2 — v4 dropped the JIT configuration API that NativeWind v2 relies on; the combination silently produces no styles.
5. **ALWAYS** include `nativewind/preset` in `tailwind.config.js` — without the preset, Tailwind compiles classes but NativeWind cannot inject them into React Native's StyleSheet engine.

## Anti-Patterns

| Anti-Pattern                                         | Why It Fails                                                                                                | Correct Approach                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Using nativewind above 2.0.11 with tailwindcss 3.3.2 | PostCSS API mismatch triggers `process(css).then(cb)` runtime error; styles fail silently                   | Pin to `nativewind@2.0.11` + `tailwindcss@3.3.2`; do not upgrade without migration guide                                   |
| Upgrading only one of the two packages               | Mismatched peer dependencies cause cryptic PostCSS errors                                                   | Remove both and reinstall together: `npm remove nativewind tailwindcss && npm install nativewind@2.0.11 tailwindcss@3.3.2` |
| Missing `nativewind/preset` in tailwind.config.js    | Tailwind compiles classes but NativeWind cannot inject them into React Native StyleSheet; no styles applied | Add `presets: [require('nativewind/preset')]` to `tailwind.config.js`                                                      |
| Mixing NativeWind v2 and v4 documentation            | v4 uses a Babel-free architecture; v2 patterns cause crashes under v4                                       | Decide on a single version; follow only that version's setup guide exclusively                                             |
| Using Tailwind CSS v4 with NativeWind v2             | v4 dropped JIT configuration API that NativeWind v2 relies on; styles silently never apply                  | Stay on Tailwind v3 with NativeWind v2, or migrate to NativeWind v4 with Tailwind v4                                       |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
