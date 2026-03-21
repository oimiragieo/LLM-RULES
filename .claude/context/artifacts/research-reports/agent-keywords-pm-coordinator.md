<!-- Agent: pm-coordinator | Task: agent-updater-validation | Session: 2026-02-22 -->

# Research Report: PM Coordinator Agent Keywords & Capabilities

**Date:** 2026-02-22
**Agent:** pm-coordinator v1.0.0 → v1.1.0
**Workflow:** agent-updater skill v1.1.0 validation run

---

## BLS Occupational Alignment

**Occupation Matched:** Project Management Specialists (BLS SOC 13-1082)
**Median Wage (2024):** $100,750/year
**Employment:** 1,046,300 (projected 6% growth, 2024–2034)

### Key Duties from BLS OOH (What They Do)

| Duty | In v1.0.0? | Status |
|------|-----------|--------|
| Coordinate budget, schedule, staffing | Partial (schedule/staffing only) | GAP |
| Produce and distribute project documents | No | GAP |
| Monitor project milestones and deliverables | Yes | COVERED |
| Monitor project costs to stay within budget | No | GAP |
| Confer with project staff to resolve problems | Yes (blocker escalation) | COVERED |
| Assign duties/responsibilities to project staff | Partial | COVERED |
| Identify, review, and select vendors/consultants | No | GAP |
| Serve as point of contact for client/customer | No | GAP |
| Propose, review, and approve modifications to plans | Yes (change request evaluation) | COVERED |
| Coordinate procurement | No | GAP |

### BLS Skills Required (O*NET 13-1082)

| Skill | In v1.0.0? | Status |
|-------|-----------|--------|
| Complex problem solving | Yes | COVERED |
| Coordination | Yes | COVERED |
| Time management | Yes (sprint planning) | COVERED |
| Active listening | Yes (stakeholder comms) | COVERED |
| Judgment and decision making | Yes | COVERED |
| Systems analysis | Yes (value stream mapping) | COVERED |
| Management of financial resources | No | GAP |
| Management of material resources | No | GAP |
| Negotiation | Yes (scope negotiation) | COVERED |

---

## Ongig / Lightcast Title Variants

Sources: Lightcast Titles Taxonomy, Teal Job Title Hierarchy, APMG International, Talent500

| Title Variant | In Routing Table? | Action |
|--------------|------------------|--------|
| Project Manager | Partial (project-management) | COVERED |
| Project Coordinator | No | ADDED |
| Scrum Master | No | ADDED |
| Agile Coach | No | ADDED |
| Agile Project Manager | Partial | ADDED (agile) |
| Delivery Manager | No | ADDED |
| Release Manager | No | ADDED |
| PMO Lead / PMO Manager | No | ADDED (pmo) |
| Program Coordinator | No | ADDED |
| Agile Delivery Manager | No | ADDED (agile-delivery) |
| Release Train Engineer (RTE) | No | ADDED (release-train) |
| Technical Program Manager | Yes (tpm keyword) | COVERED |
| Product Owner | Covered by pm agent | N/A |

---

## Skills Gap Analysis

### COVERED in v1.0.0

- Sprint planning and ceremonies (full coverage)
- Roadmap strategy (Now/Next/Later, OKRs)
- RAID log management
- Stakeholder communication templates
- Jira + Linear workflow mastery
- DORA metrics and flow metrics
- Value stream mapping
- SAFe/LeSS scaling
- INVEST criteria, DoR, DoD
- Story point estimation

### GAP — Added in v1.1.0

- Budget variance reporting, ETC/EAC cost forecasting
- Vendor/consultant evaluation and selection
- Procurement planning
- Client/customer point-of-contact role
- PMO charter and maturity model assessment
- Project portfolio prioritization (scoring matrices)
- Stage-gate reviews
- Scrum Master facilitation duties
- Release Train Engineer (RTE) coordination
- AI-assisted risk forecasting and predictive modeling
- Real-time resource reallocation from burndown signals
- Digital twin project simulation

---

## Routing Keywords Analysis

### Existing pm-coordinator keywords (v1.0.0)

`project-management`, `sprint-planning`, `product-roadmap`, `sprint-backlog`,
`user-story`, `acceptance-criteria`, `sprint-retro`, `jira`, `linear`, `okr`,
`sprint-milestone`

### New keywords added (v1.1.0) — 21 additions

```
scrum, scrummaster, scrum-master, agile, agile-coach,
delivery-manager, release-manager, pmo, project-coordinator,
program-coordinator, kanban, wip, velocity, burndown,
capacity-plan, release-train, agile-delivery, project-budget,
vendor-selection, raid-log, project-portfolio
```

### Notable routing conflict (non-blocking)

`retrospective` → routes to `reflection-agent` (correct — serves framework reflection)
`sprint-retro` → routes to `pm-coordinator` (correct — serves sprint ceremonies)
This is intentional and correct. No change needed.

---

## Diff Plan with Risk Scoring

```
PATCH PLAN: pm-coordinator
Objective: Fill BLS occupational gaps, add 2026 AI-PM capabilities, expand routing coverage

Risk Score: low
Risk Justification: No model changes, no tool changes, no permission changes, no security hooks
                    affected. Only wording/capability additions and routing keyword expansion.

Changes:
1. Frontmatter: version 1.0.0 → 1.1.0, description expanded with title variants — risk: low
2. New section: Scrum Master / RTE facilitation duties under Process Improvement — risk: low
3. New section: Budget & Vendor Management (BLS 13-1082 gaps) — risk: low
4. New section: PMO Setup & Governance — risk: low
5. New section: AI-Driven Project Intelligence (2026) — risk: low
6. Example interactions: 6 new examples added — risk: low
7. routing-table-core-map.cjs: 21 new pm-coordinator keywords — risk: medium
   (routing changes affect agent dispatch for new query patterns)

Prompt Files: .claude/agents/domain/pm-coordinator.md
Workflow Files: none
Validation Commands:
  - node .claude/tools/cli/generate-agent-registry.cjs
  - node .claude/tools/cli/validate-integration.cjs .claude/agents/domain/pm-coordinator.md
  - pnpm lint:fix
  - pnpm format
```

---

## RED/GREEN/REFACTOR/VERIFY Backlog

### RED (what was missing or incorrect)

- R1: No budget or cost management capability
- R2: No vendor/procurement section
- R3: No PMO setup guidance
- R4: Scrum Master duties not explicitly enumerated
- R5: 21 common user phrasings (scrum, agile, kanban, pmo, etc.) not in routing
- R6: No AI-driven PM intelligence for 2026 context
- R7: Title variants (Scrum Master, Agile Coach, PMO Lead, Delivery Manager) not discoverable

### GREEN (minimal changes applied)

- G1: Budget & Vendor Management section added
- G2: PMO Setup & Governance section added
- G3: Scrum Master / RTE duties added under Process Improvement
- G4: AI-Driven Project Intelligence section added
- G5: 21 routing keywords added
- G6: Description updated with title variants
- G7: 6 new example interactions added

### REFACTOR (structural improvements — deferred, low priority)

- R1: Consider splitting pm-coordinator into pm-coordinator (agile/scrum) and pmo-coordinator (governance) if scope grows
- R2: Consider adding `spec-critique` skill for requirements review scenarios

### VERIFY (validation results)

- validate-integration.cjs: 8 passed, 0 failed, 3 skipped — PASS
- generate-agent-registry.cjs: 65 agents, validation PASSED
- pnpm lint:fix: 0 errors — PASS
- pnpm format: unchanged (0 format changes needed) — PASS

---

## Delta: What Updater Surfaced vs Manual Creation

| Finding | Source | Severity |
|---------|--------|----------|
| Budget/cost tracking completely absent | BLS 13-1082 duties | HIGH (core PM duty) |
| Vendor selection not covered | BLS 13-1082 duties | HIGH (core PM duty) |
| PMO governance absent | Title variant research | MEDIUM |
| Scrum Master duties only implied, not enumerated | Agile PM title research | MEDIUM |
| 21 routing keywords missing | Title variant + BLS research | HIGH (discoverability) |
| AI-driven PM tools (2026) not mentioned | Industry trend research | MEDIUM |
| Title variants not in description | Ongig/Lightcast taxonomy | LOW |
| Release Train Engineer not mentioned | Agile scaling research | LOW |

**Summary:** Manual creation focused on the core sprint/roadmap persona. Occupational research
(BLS OOH) revealed two entire capability domains (budget management, vendor management) that
a real project management specialist performs as primary duties. Routing research revealed 21
common user phrasings that would have resulted in zero routing hits to pm-coordinator.
