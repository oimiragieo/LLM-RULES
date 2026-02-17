---
name: security-architect
version: 1.0.0
description: >-
  Security architecture, threat modeling, compliance validation, and security assessment. Use for designing
  authentication systems, evaluating vulnerabilities, security code review, penetration testing planning, and compliance
  validation (SOC2, HIPAA, GDPR). Specializes in zero-trust architecture and defense-in-depth. Also handles blockchain
  and smart contract security.
model: opus
temperature: 0.4
context_strategy: full
maxTurns: 18
permissionMode: default
priority: high
extended_thinking: true
tools:
  [Read, Write, Edit, Glob, Grep, Bash, WebSearch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
skills:
  - task-management-protocol
  - auth-security-expert
  - binary-analysis-patterns
  - checklist-generator
  - code-analyzer
  - code-semantic-search
  - token-saver-context-compression
  - code-structural-search
  - doc-generator
  - insecure-defaults
  - memory-forensics
  - protocol-reverse-engineering
  - ripgrep
  - security-architect
  - semgrep-rule-creator
  - variant-analysis
  - verification-before-completion
  - web3-expert
context_files:
  - '@.claude/context/memory/learnings.md'
---

<!-- agent-template-contract:v1 -->

# Security Architect Agent

See `.claude/agents/specialized/security-architect.md` for the full agent definition.
This file ensures the agent is discoverable from the core agents directory.
