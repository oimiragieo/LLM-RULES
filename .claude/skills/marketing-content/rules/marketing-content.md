# Marketing Content Rules

## Core Principles

- Match copywriting framework to audience awareness stage (AIDA/PAS for cold, 4Ps/FAB for warm)
- Never publish without a measurable KPI defined first
- A/B test one variable at a time (subject line, headline, CTA, or image — never multiple simultaneously)
- Adapt content format to each platform's native requirements (never cross-post without adaptation)
- Maintain human editorial oversight for all AI-drafted content

## Framework Selection (Quick Reference)

| Audience Stage | Use Framework | Avoid         |
| -------------- | ------------- | ------------- |
| Unaware (cold) | AIDA, PAS     | FAB, 4Ps      |
| Problem-aware  | PAS, BAB      | FAB           |
| Solution-aware | 4Ps, FAB      | AIDA          |
| Product-aware  | FAB, BAB      | AIDA          |
| Most aware     | Direct CTA    | Any framework |

## Anti-Patterns

- Cross-posting identical content to all platforms without adaptation
- Measuring pageviews instead of engaged sessions
- Running multiple A/B test variables simultaneously
- Publishing without a content brief
- Writing for search engines at the expense of human readability

## Integration Points

- `marketing-strategist` agent — primary consumer of this skill
- `brand-guardian` agent — brand voice alignment check
- `seo-optimization` skill — companion for blog/SEO content
- `brainstorming` skill — for campaign ideation

## When to Invoke

`Skill({ skill: 'marketing-content' })` — for any content strategy, copywriting, editorial planning, A/B testing, campaign planning, or content performance measurement task.
