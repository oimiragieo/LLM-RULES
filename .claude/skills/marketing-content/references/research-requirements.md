# Research Requirements — marketing-content Skill

**Date**: 2026-03-02
**Intent**: Research marketing content creation best practices for skill design
**Research Report**: `.claude/context/artifacts/research-reports/marketing-content-research-2026-03-02.md`

## Queries Executed

1. "content marketing strategy frameworks best practices 2025 AI-assisted copywriting editorial calendar"
   — Source: WebSearch → Canva, First Movers, Medium, Copy.ai
2. "content marketing A/B testing audience targeting platform-specific content optimization methodology 2025"
   — Source: WebSearch → madgicx, symphonicdigital, Mailchimp, Optimizely
3. "content campaign planning methodology content performance metrics measurement KPI framework 2025"
   — Source: WebSearch → hellobonsai, eliya.io, planable.io

## VoltAgent Awesome-Skills Search

Searched VoltAgent/awesome-agent-skills for "marketing-content", "copywriting", "editorial" — no matching skill found.

## Key Design Constraints (Mapped to Artifacts)

1. **Framework selection depends on audience awareness stage** (Medium, Mailchimp)
   → Implemented in SKILL.md Content Strategy Framework + rules/marketing-content.md
   → Enforced by `hooks/pre-execute.cjs` (validates `audience_stage` enum)

2. **A/B test one variable at a time, minimum 500 impressions, 7-day minimum duration** (Mailchimp, Optimizely)
   → Implemented in SKILL.md A/B Testing Workflow section
   → Reflected in `schemas/input.schema.json` (action: "design-ab-test")

3. **Platform-specific content strategy is mandatory; cross-posting without adaptation reduces organic reach 50-80%** (madgicx, Copy.ai)
   → Implemented in SKILL.md Platform-Specific Content Guidelines
   → Enforced as Iron Law #4 in SKILL.md

## Non-Goals

- Not a full analytics dashboard (out of scope; use dedicated analytics tools)
- Not a content management system (CMS integration out of scope)
- Not a social media scheduler (scheduling tools are separate)
- Not a brand voice enforcer (handled by `brand-guardian` agent)

## Sources

- [AI Content Marketing Survival Guide](https://firstmovers.ai/ai-content-marketing-survival-guide/)
- [Copywriting Frameworks 2025](https://medium.com/@ninaalexkotova/copywriting-frameworks-without-myths-insights-for-2025-bd846c45a473)
- [Future of Content Marketing with AI](https://www.copy.ai/blog/future-of-content-marketing-ai)
- [A/B Testing in Digital Marketing](https://mailchimp.com/marketing-glossary/ab-tests/)
- [AI-Powered Audience Targeting](https://madgicx.com/blog/audience-targeting)
- [Content Marketing KPIs 2025](https://www.hellobonsai.com/blog/kpis-content-marketing)
- [Marketing Measurement Framework](https://www.eliya.io/blog/marketing-measurement/measurement-framework)
