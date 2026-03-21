<!-- Agent: developer | Task: #15 | Session: 2026-03-02 -->

# Research Report: Brand Compliance Skill

**Date:** 2026-03-02
**Artifact Type:** Skill
**Domain:** Brand Identity Enforcement, Style Guide Validation, Tone of Voice, Visual Consistency

---

## Executive Summary

Brand compliance is a high-value domain where AI-assisted validation reduces manual review time by 40–65%. Modern implementations combine NLP-based tone checking with visual asset validation and design token enforcement. The skill should provide a structured audit checklist covering: style guide adherence, tone of voice scoring, visual identity consistency, brand asset management, and cross-channel coherence. It targets the `brand-guardian` agent.

---

## Research Methodology

| # | Query | Source Count |
|---|-------|-------------|
| 1 | brand compliance style guide validation AI automation best practices 2025 | 10 |
| 2 | tone of voice brand voice checking tools automated brand consistency enforcement 2025 | 10 |
| 3 | brand guidelines enforcement visual identity cross-channel coherence programmatic validation | 10 |

**Sources consulted:**
- [AI for Brand Management — Frontify](https://www.frontify.com/en/guide/ai-for-brand-management)
- [Brand Compliance Best Practices 2026 — Puntt.ai](https://www.puntt.ai/blog/brand-compliance-best-practices-2026)
- [Content Quality Control — Typeface.ai](https://www.typeface.ai/blog/content-quality-control-in-ai-marketing-enterprise-governance-and-best-practices)
- [AI Tools for Brand Voice Consistency — AIM Technologies](https://www.aimtechnologies.co/2025/04/30/ai-tools-for-brand-voice-consistency-keeping-your-brands-tone-on-point/)
- [Brand Voice Consistency Checker — Pressmaster](https://www.pressmaster.ai/article/brand-voice-consistency-checker)
- [Brand Consistency Guide 2025 — Canva](https://www.canva.com/resources/brand-consistency/)
- [Brand Compliance Guidelines — Webrand](https://webrand.com/blog/brand-compliance/brand-compliance-guidelines-enterprise-best-practices)

---

## Detailed Findings

### Finding 1: Style Guide Validation
- AI systems reduce brand violations by 40–60% and save significant manual review time
- Validation checks: logo placement, color palette accuracy, typography specifications, spacing
- Design tokens (JSON/YAML) enable cross-platform enforcement of colors, typography, spacing
- Best practice: validate early in content pipeline before assets go live

### Finding 2: Tone of Voice / Brand Voice Checking
- NLP tools score content against a brand voice profile (500-word sample + 4 characteristics)
- Tools like Jasper, Grammarly Business, Acrolinx flag off-brand tone with remediation suggestions
- Key dimensions: formality, warmth, authority, personality traits (e.g., bold vs. approachable)
- Outputs: alignment score, specific flagged phrases, 2–3 rewrite suggestions

### Finding 3: Visual Identity & Cross-Channel Coherence
- Visual identity audit covers: logo usage, color palette, typography hierarchy, imagery/photography style, icon language
- Channel-specific tailoring maintains coherence: Instagram Stories vs. print vs. mobile vs. digital signage
- AI-driven platforms ensure real-time synchronization when guidelines update
- Programmatic validation via design token diff checks against approved token registry

### Finding 4: Brand Asset Management
- DAM (Digital Asset Management) integration: version tracking, asset approval workflows
- Categories: approved assets, deprecated assets, restricted usage contexts
- Pattern: asset → compliance check → approval gate → distribution

---

## Existing Codebase Patterns

**Similar Skills Found:**
- `.claude/skills/design-and-user-experience-guidelines/SKILL.md` — Identity/capabilities/instructions/examples structure; simple rule-application workflow
- `.claude/skills/code-style-validator/SKILL.md` — Validation skill with Iron Laws, Anti-Patterns table, execution steps, frontmatter with tools/model
- `.claude/skills/styling-expert/SKILL.md` — Domain expert skill with consolidated rules, simple identity/capabilities/instructions

**Conventions Identified:**
- Naming: lowercase kebab-case, noun-noun or adjective-noun pattern
- Structure: YAML frontmatter → identity → capabilities → instructions → examples → iron laws → anti-patterns → memory protocol
- Tools: `[Read, Write, Edit, Grep, Glob]` for review/audit skills
- Model: `sonnet` for analysis/validation skills; `haiku` for fast checks
- Output: structured findings with severity (error/warning/info), line-level specificity, summary counts
- Frontmatter: `invoked_by: both`, `user_invocable: true`, `error_handling: graceful`

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Validate before publish, not after | Puntt.ai | High | Catching violations at creation time reduces rework 65% |
| 2 | Score tone against baseline voice profile | AIM Technologies | High | Objective scoring enables automated pass/fail gates |
| 3 | Use design tokens as ground truth for visual checks | Zigpoll/Canva | High | JSON token files are machine-readable and always in sync |
| 4 | Provide specific remediation, not just flags | Jasper/Pressmaster | High | 2–3 concrete suggestions increase fix rate dramatically |
| 5 | Audit each channel separately with shared rules | Webrand | Medium | Channel-specific asset dimensions differ; core rules are universal |
| 6 | Categorize findings by severity (error/warning/info) | code-style-validator (codebase) | High | Consistent with existing skill conventions |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives |
|----------|-----------|--------|-------------|
| Skill model: `sonnet` | Analysis-heavy validation requires reasoning; haiku insufficient for tone scoring | config.yaml pattern | haiku (too weak for tone NLP) |
| Tools: `[Read, Write, Edit, Grep, Glob]` | Review + output report; no bash needed for brand audit | code-style-validator pattern | Bash (unnecessary) |
| Invoked by: `both` | Brand guardian invokes it; users can also run it directly | design-and-ux pattern | agents-only (too restrictive) |
| Output format: structured severity table | Consistent with code-style-validator; machine-readable | codebase convention | Prose (not parseable) |
| Category: domain-specific | Brand compliance is specialized, not core infrastructure | skill catalog structure | quality (wrong domain) |
| Assign to: `brand-guardian` | Primary consumer per task specification | task assignment | marketing-strategist (secondary) |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Tone scoring is subjective without baseline | High | Medium | Require brand voice profile as input; provide default dimensions |
| Visual token checks fail without token file | Medium | Medium | Graceful skip when token file absent; warn user |
| Overly strict validation blocks legitimate creative work | Medium | Medium | Separate error (block) vs. warning (inform) severity levels |
| Skill duplicates design-and-ux-guidelines scope | Low | Low | Brand compliance is enforcement; design-and-ux is guidance — different purposes |

---

## Recommended Implementation

**File Location:** `.claude/skills/brand-compliance/`
**Template:** Follow `code-style-validator` SKILL.md structure (validation skill pattern)
**Model:** `sonnet`

**Skill Structure:**
1. Identity: brand compliance auditor
2. Capabilities: 5 areas (style guide, tone, visual, asset, cross-channel)
3. Instructions: 5 audit steps, one per capability area
4. Examples: content audit example + visual audit example
5. Iron Laws: 5 non-negotiable rules
6. Anti-Patterns: table with failures and corrections
7. Memory Protocol: standard

**Skills to assign:**
- Primary: `brand-guardian`
- Secondary: `marketing-strategist`

**Companions needed (per ecosystem-creation-workflow):**
- Schema: `skill-brand-compliance-output.schema.json`
- Command: `.claude/commands/brand-compliance.md`
- Rules: `.claude/rules/brand-compliance.md`

---

## Quality Gate Checklist

- [x] 3 research queries executed (exactly 3, within limit)
- [x] 7 external sources consulted
- [x] 2+ existing codebase skill patterns documented
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented
- [x] Report saved to correct location (`brand-compliance-research-2026-03-02.md`)
- [x] Provenance header included
- [x] Report size <10 KB

---

## Next Steps

1. Invoke `Skill({ skill: 'skill-creator' })` with name: `brand-compliance`
2. Reference this report for design decisions
3. Assign to `brand-guardian` and `marketing-strategist` agents

**Proceed with creation:** YES
**Confidence Level:** High
