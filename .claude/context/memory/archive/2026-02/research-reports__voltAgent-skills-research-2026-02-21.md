<!-- Agent: evolution-orchestrator | Task: #2 | Session: 2026-02-21 -->

# VoltAgent Awesome-Agent-Skills Research Report

**Date:** 2026-02-21
**Phase:** O (Obtain) - EVOLVE Workflow
**Task:** Research VoltAgent awesome-agent-skills repo and select 5-8 skills for creation

---

## Research Budget

- Query 1: VoltAgent README fetch -- Result: 383+ skills indexed across 30+ categories
- Query 2: Vercel Labs agent-skills repo (react-best-practices, web-design-guidelines, next-upgrade) -- Result: Found SKILL.md content for 3 skills
- Query 3: Google Labs stitch-skills repo (enhance-prompt, shadcn-ui) -- Result: Found SKILL.md content for 2 skills
- Query 4: Cloudflare skills repo (web-perf) -- Result: Found comprehensive 5-phase audit workflow
- Query 5: Vercel Labs next-skills repo (next-cache-components, next-best-practices) -- Result: Found Next.js 16 caching model details

Total: 5/5 queries used
Status: WITHIN BUDGET

---

## Repository Overview

**Source:** https://github.com/VoltAgent/awesome-agent-skills
**Nature:** Curated index (not hosting actual skills) linking to source repos
**Total Skills Indexed:** 383+
**Key Source Repos:**

- vercel-labs/agent-skills (React, deployment, web design)
- vercel-labs/next-skills (Next.js specific)
- google-labs-code/stitch-skills (UI generation, shadcn, prompt engineering)
- cloudflare/skills (Workers, web perf, deployment)
- openai/skills (deployment, coding patterns)
- anthropics/skills (frontend design, coding patterns)

---

## Existing Catalog Cross-Reference

Skills that ALREADY EXIST in our catalog (excluded from selection):

- `react-expert` -- React hooks, state management, React 19, Shadcn UI
- `nextjs-expert` -- Next.js App Router, Server Components
- `frontend-expert` -- UI/UX patterns, responsive design
- `accessibility` -- WCAG 2.1 AA compliance
- `context-degradation` -- Token-range severity zones
- `property-based-testing` -- fast-check patterns
- `agent-tool-design` -- 5 principles for tool design
- `agent-evaluation` -- LLM-as-judge framework
- `multi-agent-architecture-reference` -- Multi-agent topology decision matrix
- `context-compressor` / `context-compressor` -- Context management
- `sharp-edges` -- Hazard patterns catalog

Skills that exist ON DISK but NOT in catalog (recently created, need catalog integration):

- `react-best-practices-vercel` -- Vercel React perf guidelines (57 rules)
- `web-design-guidelines-vercel` -- Web Interface Guidelines compliance
- `react-native-skills-vercel` -- React Native + Expo patterns
- `building-secure-contracts` -- Smart contract security
- `feature-flag-management` -- Feature flag lifecycle
- `spec-to-code-compliance` -- Spec-to-code verification

---

## Final Selection: 6 Skills

### 1. enhance-prompt (Google Labs)

**Source:** google-labs-code/stitch-skills
**Category:** Prompt Engineering / LLM Optimization
**Why Selected:** Fills a genuine gap -- no prompt engineering/optimization skill exists in the catalog. Transforms vague UI ideas into structured, optimized prompts with design system awareness.
**Key Features:**

- 4-step enhancement pipeline (Assess, Check DESIGN.md, Apply Enhancements, Format Output)
- UI/UX keyword injection (vague terms -> specific component names)
- Design system block generation (color tokens, typography, spacing)
- Structured page layout scaffolding
  **Target Agents:** planner, frontend-pro, architect, developer
  **Overlap:** None -- unique capability

### 2. next-upgrade (Vercel Labs)

**Source:** vercel-labs/next-skills
**Category:** Web Development / Framework Migration
**Why Selected:** Complements `nextjs-expert` by providing a structured upgrade workflow for Next.js version migrations. Highly practical for maintaining Next.js projects.
**Key Features:**

- 9-step upgrade workflow (detect version -> run codemods -> update deps -> test)
- Codemod automation via `npx @next/codemod@latest`
- Incremental upgrade path for major version jumps (13->14->15->16)
- Breaking change detection and resolution
  **Target Agents:** nextjs-pro, developer, devops
  **Overlap:** Minimal with `nextjs-expert` (expert covers patterns, this covers migration)

### 3. vercel-deploy (Vercel Labs)

**Source:** vercel-labs/agent-skills
**Category:** Vercel/Deployment
**Why Selected:** Fills deployment gap -- no Vercel-specific deployment skill exists. Zero-auth deployment with framework auto-detection for 20+ frameworks.
**Key Features:**

- Zero-auth deployment via CLI script
- Automatic framework detection (Next.js, Vite, Remix, SvelteKit, etc.)
- JSON output with previewUrl, claimUrl, deploymentId
- Claimable deployments (transfer to user's Vercel account)
  **Target Agents:** devops, developer, frontend-pro
  **Overlap:** None -- fills deployment gap

### 4. shadcn-ui (Google Labs)

**Source:** google-labs-code/stitch-skills
**Category:** Web Development / UI Components
**Why Selected:** shadcn/ui is the dominant component system for modern React/Next.js apps. Provides deep expertise on Radix UI, Tailwind CSS v4, component patterns.
**Key Features:**

- Component installation and customization patterns
- Tailwind CSS v4 integration with CSS variables
- Framework-specific setup (Next.js App Router, Pages Router, Vite)
- Dark mode theming via CSS variables
- Accessibility-first component patterns
  **Target Agents:** frontend-pro, developer, nextjs-pro
  **Overlap:** Minimal with `react-expert` (expert covers React broadly, this covers shadcn/ui specifically)

### 5. web-perf (Cloudflare)

**Source:** cloudflare/skills
**Category:** Web Development / Performance
**Why Selected:** No web performance auditing skill exists. Provides a structured 5-phase audit workflow with Core Web Vitals thresholds and actionable recommendations.
**Key Features:**

- 5-phase audit: Performance Trace, Core Web Vitals, Network Analysis, Accessibility, Codebase Analysis
- Core Web Vitals thresholds (LCP, CLS, INP, TBT, FCP, TTFB, Speed Index)
- Chrome DevTools MCP integration
- Framework-specific optimization (Webpack, Vite, Next.js, Nuxt)
- Render-blocking resource detection
  **Target Agents:** frontend-pro, developer, qa, devops
  **Overlap:** None -- unique capability

### 6. next-cache-components (Vercel Labs)

**Source:** vercel-labs/next-skills
**Category:** Web Development / Next.js Caching
**Why Selected:** Covers the cutting-edge Next.js 16 caching model (cacheComponents, 'use cache' directive, PPR). Essential for modern Next.js development.
**Key Features:**

- `cacheComponents: true` configuration
- `'use cache'` directive usage patterns
- Cache profiles and `cacheLife()` API
- `cacheTag()` and `updateTag()` for cache invalidation
- Partial Prerendering (PPR) integration
  **Target Agents:** nextjs-pro, developer
  **Overlap:** Complements `nextjs-expert` with deep caching expertise

---

## Rejected Candidates (with rationale)

| Skill                 | Source      | Reason for Rejection                                                  |
| --------------------- | ----------- | --------------------------------------------------------------------- |
| react-best-practices  | Vercel Labs | Already exists on disk as `react-best-practices-vercel`               |
| web-design-guidelines | Vercel Labs | Already exists on disk as `web-design-guidelines-vercel`              |
| react-native-skills   | Vercel Labs | Already exists on disk as `react-native-skills-vercel`                |
| netlify-deploy        | OpenAI      | Lower priority than Vercel-specific deployment                        |
| cloudflare-deploy     | OpenAI      | Lower priority -- we already have Cloudflare Worker skills            |
| render-deploy         | OpenAI      | Niche platform, low demand                                            |
| context-fundamentals  | Community   | Overlaps with existing `context-compressor` and `context-degradation` |
| context-optimization  | Community   | Overlaps with `context-compressor`                                    |
| composition-patterns  | Community   | Overlaps with `react-expert` composition guidance                     |
| next-best-practices   | Vercel Labs | Overlaps significantly with existing `nextjs-expert`                  |

---

## Implementation Plan

**Order:** Sequential creation (one at a time to avoid context overflow)
**Method:** `Skill({ skill: 'skill-creator' })` for each
**Post-creation:** Catalog update + agent assignment for each

1. enhance-prompt
2. next-upgrade
3. vercel-deploy
4. shadcn-ui
5. web-perf
6. next-cache-components

---

## Sources Consulted

1. https://github.com/VoltAgent/awesome-agent-skills (curated index)
2. https://github.com/vercel-labs/agent-skills (Vercel agent skills)
3. https://github.com/vercel-labs/next-skills (Next.js specific skills)
4. https://github.com/google-labs-code/stitch-skills (Google Labs Stitch skills)
5. https://github.com/cloudflare/skills (Cloudflare agent skills)
6. https://github.com/openai/skills (OpenAI agent skills)
7. https://deepwiki.com/google-labs-code/stitch-skills/5.1-getting-started-with-shadcn-ui (shadcn-ui docs)
8. https://skills.sh/google-labs-code/stitch-skills/shadcn-ui (skill registry)
