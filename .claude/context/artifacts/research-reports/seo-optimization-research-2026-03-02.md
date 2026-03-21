<!-- Agent: developer | Task: #14 | Session: 2026-03-02 -->

# Research Report: SEO Optimization Skill

## Executive Summary

SEO best practices in 2025-2026 have converged around three pillars: technical excellence (Core Web Vitals, structured data, crawlability), content authority (E-E-A-T, topical clusters, AI-ready content), and adaptive link building (relevance-first outreach). AI Overviews now appear in 57% of SERPs, making structured data and E-E-A-T signals more critical than ever for visibility in both traditional and AI-driven search results.

## Research Methodology

| # | Query | Source Type |
|---|-------|-------------|
| 1 | Technical SEO best practices 2025 Core Web Vitals structured data schema markup | WebSearch |
| 2 | SEO keyword research strategy on-page optimization content SEO best practices 2025 | WebSearch |
| 3 | SEO link building strategies 2025 AI search optimization E-E-A-T ranking factors | WebSearch |

**Sources consulted:**
- [Rankite - Technical SEO Best Practices 2025](https://rankite.com/technical-seo-best-practices-for-2025-what-you-need-to-know/)
- [uSERP - Technical SEO Complete Guide](https://userp.io/seo/technical-seo/)
- [WordStream - SEO Ranking Factors 2025](https://www.wordstream.com/blog/seo-ranking-factors-2025)
- [SEO.com - Keyword Research Guide 2025](https://www.seo.com/basics/on-page-seo/keyword-research/)
- [Backlinko - SEO Best Practices](https://backlinko.com/hub/seo/best-practices)
- [Svitla - SEO Best Practices 2026](https://svitla.com/blog/seo-best-practices/)
- Existing codebase: `.claude/skills/seo-and-meta-tags-in-sveltekit/` (framework-specific SEO)
- Existing codebase: `.claude/skills/web-perf/SKILL.md` (Core Web Vitals patterns)

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `.claude/skills/seo-and-meta-tags-in-sveltekit/SKILL.md` — Framework-specific (SvelteKit meta tags), narrow scope, thin rules file pattern
- `.claude/skills/web-perf/SKILL.md` — Performance audit skill with phases, tables, checklists, anti-patterns, iron laws, code examples. Excellent structural reference.

**Conventions Identified:**
- Naming: kebab-case, descriptive noun phrase (e.g., `web-perf`, `seo-optimization`)
- Structure: frontmatter → When to Apply → Core Concepts (tables) → Phased Workflow → Anti-Patterns → Iron Laws → References → Memory Protocol
- Tools: `tools: []` for advisory/audit skills with no direct tool integrations
- Output: Checklist tables, `P0/P1/P2` priority classifications, audit report templates
- Agents: Domain specialists (marketing-strategist, aso-specialist) are the target agents

## Detailed Findings

### Technical SEO (2025-2026)

**Core Web Vitals:**
- LCP ≤ 2.5s (loading), INP ≤ 200ms (replaced FID), CLS ≤ 0.1 (stability)
- INP (Interaction to Next Paint) is now the interactivity metric, measuring full sessions
- Google page experience signals include all three CWV metrics

**Structured Data / Schema Markup:**
- JSON-LD is the preferred format (over Microdata/RDFa)
- Key schema types: Article, Product, FAQ, LocalBusiness, BreadcrumbList, Organization, WebPage
- Schema determines eligibility for rich results, featured snippets, and AI Overviews
- AI Overviews appear in 57% of SERPs (June 2025, up from 25% in Aug 2024)
- Validate with: Google's Rich Results Test, Schema.org validator

**Crawlability & Indexing:**
- XML sitemaps with `<lastmod>`, `<changefreq>`, `<priority>`
- robots.txt must not block JS/CSS crawlers need to render pages
- Canonical tags prevent duplicate content penalties
- HTTPS is a ranking signal; HTTP is penalized

### Keyword Research Strategy

**Modern approach:**
- Search intent classification: informational, navigational, commercial, transactional
- Long-tail keywords: lower competition, higher conversion intent
- Topical authority clusters: group related keywords into hub-and-spoke content architecture
- Keyword gap analysis: compare with competitors using tools like Ahrefs, SEMrush
- Target: primary keyword + 3-5 LSI (Latent Semantic Indexing) synonyms per page

**On-Page Optimization:**
- Title tag: primary keyword near front, under 60 chars, unique per page
- Meta description: compelling CTA, includes keyword, 150-160 chars
- H1 tag: exactly one per page, matches or includes primary keyword
- Image alt text: descriptive, includes keyword when natural
- URL structure: short, hyphenated, includes keyword, hierarchical

### Content SEO & E-E-A-T

**E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness):**
- Google evaluates author credentials, site reputation, content accuracy
- YMYL (Your Money or Your Life) pages require highest E-E-A-T standards
- Signals: author bio pages, citations to authoritative sources, About/Contact pages, reviews
- AI-generated content: acceptable but must be reviewed for accuracy, tone, and nuance

**Content architecture:**
- Pillar pages + topic cluster model for topical authority
- Internal linking: link from cluster pages to pillar, and between related clusters
- Content freshness: update dates, re-index triggers for evergreen content

### Link Building (2025)

**Quality over quantity:**
- Domain Rating (DR) and topical relevance matter more than raw link count
- Effective tactics: guest posting on authority sites, digital PR, resource page outreach, broken link building
- Anchor text diversity: branded, exact-match, partial-match, generic
- Avoid: link farms, PBNs (Private Blog Networks), paid links (violates Google guidelines)

### AI Search Optimization

**For AI Overviews and LLM citations:**
- Clear, concise answers to specific questions (FAQ schema helps)
- Structured content with headers, bullet points, numbered lists
- Factual accuracy with citations (LLMs favor authoritative sources)
- Brand mentions across the web (entity building)

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|-----------|-----------|
| 1 | Target all 3 CWV metrics (LCP, INP, CLS) | Google/web.dev | High | Direct ranking signal since 2021, updated INP 2024 |
| 2 | Implement JSON-LD schema for all content types | Google Search Central | High | Enables rich results, AI Overviews eligibility |
| 3 | Topical authority clustering over individual keywords | Backlinko, SEO.com | High | Topical relevance beats keyword density |
| 4 | E-E-A-T signals on every page | Google Quality Guidelines | High | YMYL and AI-driven search prioritizes authority |
| 5 | Long-tail keyword focus for conversion | SEMrush, Ahrefs methodology | Medium | Less competitive, higher purchase intent |
| 6 | Canonical tags + XML sitemaps for crawl efficiency | Google Search Console docs | High | Prevents duplicate content, ensures indexing |
| 7 | INP optimization over FID (deprecated) | Google/web.dev 2024 | High | FID replaced by INP in March 2024 |

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Phased audit workflow (like web-perf) | Consistent with existing skill patterns; provides structured progression | web-perf SKILL.md | Flat checklist (rejected: too unstructured for audit scenarios) |
| Include AI search optimization section | AI Overviews at 57% of SERPs makes this essential | WordStream 2025 | Skip AI section (rejected: rapidly growing relevance) |
| P0/P1/P2 priority system for findings | Matches web-perf patterns, easy for agents to prioritize | web-perf SKILL.md | Severity 1-4 (rejected: less familiar to agents) |
| JSON-LD over Microdata | Google's recommended format, easier to maintain | Google Search Central | Microdata (rejected: deprecated preference) |
| Separate from seo-and-meta-tags-in-sveltekit | That skill is framework-specific; this is universal SEO | Codebase analysis | Extend existing skill (rejected: different scope) |

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| SEO best practices change rapidly | Medium | High | Include "verify with Google Search Central" note in skill |
| Overlap with web-perf skill on CWV | Low | Medium | Reference web-perf for deep CWV analysis; this skill covers at strategy level |
| AI search landscape volatility | High | High | Frame AI optimization as additive, not replacement for core SEO |
| Schema markup breaking rich results | High | Low | Include validation step with Rich Results Test |

## Recommended Implementation

**File Location:** `.claude/skills/seo-optimization/`
**Template:** Based on web-perf SKILL.md pattern
**Agents:** `marketing-strategist`, `aso-specialist`
**Category:** domain-specific

**Skill Sections:**
1. When to Apply
2. Phase 1: Technical SEO Audit (crawlability, indexing, CWV)
3. Phase 2: Keyword Research & Strategy
4. Phase 3: On-Page Optimization
5. Phase 4: Content SEO & E-E-A-T
6. Phase 5: Structured Data Implementation
7. Phase 6: Link Building Strategy
8. Phase 7: AI Search Optimization
9. Audit Report Template
10. Anti-Patterns + Iron Laws
11. References + Memory Protocol

## Quality Gate Checklist

- [x] 3 research queries executed (exactly 3, within budget)
- [x] At least 3 external sources consulted (6 sources cited)
- [x] Existing codebase patterns documented (2 similar skills analyzed)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented
- [x] Report saved with correct naming: `seo-optimization-research-2026-03-02.md`
- [x] Provenance header included

## Research Handoff to: skill-creator

**Report Location:** `.claude/context/artifacts/research-reports/seo-optimization-research-2026-03-02.md`

**Summary:** SEO optimization in 2025-2026 centers on three pillars — technical excellence (Core Web Vitals LCP/INP/CLS, structured data, crawlability), content authority (E-E-A-T, topical clusters, AI-ready content), and relevance-first link building. AI Overviews now appear in 57% of SERPs, making structured data and E-E-A-T critical for both traditional and AI-driven search visibility.

**Critical Decisions:**
1. Use phased audit workflow (7 phases) matching web-perf SKILL.md pattern
2. Assign to marketing-strategist and aso-specialist agents
3. Include AI search optimization as dedicated phase given 57% AI Overview prevalence

**Proceed with creation:** YES
**Confidence Level:** High
