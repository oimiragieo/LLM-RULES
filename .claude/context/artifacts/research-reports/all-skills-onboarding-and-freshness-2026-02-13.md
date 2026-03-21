<!-- Agent: codex | Task: full-skill-onboarding-freshness | Session: 2026-02-13 -->

# Full Skill Onboarding and Freshness Audit (2026-02-13)

## Scope
- Skill inventory: all active skill directories under `.claude/skills/` (excluding `_archive` trees).
- Onboarding checks: file presence, frontmatter, index registration, agent references, creator-validator status.
- Freshness checks: Exa web research run across all major skill domains and representative high-impact skill topics.
- Index mode used: scan (`generate-skill-index.cjs --scan`) to include all on-disk skills.

## Summary
- Total skill directories: **154**
- `SKILL.md` present: **152**
- Registered in `skill-index`: **152**
- Agent-referenced: **152**
- `quick_validate.py` pass: **3**
- `quick_validate.py` fail: **149**

## Notes
- The strict `skill-creator` validator is intentionally minimal and flags most extended frontmatter fields used by this framework.
- `creators` and `integration` are container directories (no standalone `SKILL.md`).

## Per-Skill Matrix
| Skill | SKILL.md | Frontmatter | quick_validate | Registered | Agent-Referenced | Domain | Exa Researched | Freshness Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| accessibility | yes | yes | fail | yes | yes | styling | yes | medium |
| advanced-elicitation | yes | yes | fail | yes | yes | other | yes | medium |
| agent-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| ai-ml-expert | yes | yes | fail | yes | yes | ai-ml | yes | medium |
| android-expert | yes | yes | fail | yes | yes | mobile | yes | medium |
| api-development-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| architecture-review | yes | yes | fail | yes | yes | architecture | yes | medium |
| artifact-integrator | yes | yes | fail | yes | yes | other | yes | medium |
| artifact-lifecycle | yes | yes | fail | yes | yes | creator | yes | medium |
| arxiv-mcp | yes | yes | fail | yes | yes | research | yes | medium |
| async-operations | yes | yes | fail | yes | yes | development | yes | medium |
| auth-security-expert | yes | yes | fail | yes | yes | security | yes | high |
| aws-cloud-ops | yes | yes | fail | yes | yes | devops | yes | high |
| best-practices-guidelines | yes | yes | fail | yes | yes | other | yes | medium |
| binary-analysis-patterns | yes | yes | fail | yes | yes | security | yes | high |
| build-tools-expert | yes | yes | fail | yes | yes | other | yes | medium |
| checklist-generator | yes | yes | fail | yes | yes | quality | yes | medium |
| chrome-browser | yes | yes | fail | yes | yes | integration | yes | high |
| ci-cd-implementation-rule | yes | yes | fail | yes | yes | devops | yes | high |
| cloud-devops-expert | yes | yes | fail | yes | yes | devops | yes | high |
| code-analyzer | yes | yes | fail | yes | yes | development | yes | medium |
| code-quality-expert | yes | yes | fail | yes | yes | development | yes | medium |
| code-semantic-search | yes | yes | fail | yes | yes | other | yes | medium |
| code-structural-search | yes | yes | fail | yes | yes | other | yes | medium |
| code-style-validator | yes | yes | fail | yes | yes | development | yes | medium |
| complexity-assessment | yes | yes | fail | yes | yes | planning | yes | medium |
| composer-dependency-management | yes | yes | fail | yes | yes | other | yes | medium |
| comprehensive-type-annotations | yes | yes | fail | yes | yes | languages | yes | high |
| comprehensive-unit-testing-with-pytest | yes | yes | fail | yes | yes | development | yes | medium |
| configuration-management | yes | yes | fail | yes | yes | devops | yes | high |
| consensus-voting | yes | yes | fail | yes | yes | specialized | yes | medium |
| container-expert | yes | yes | fail | yes | yes | devops | yes | high |
| containerization-rules | yes | yes | fail | yes | yes | devops | yes | high |
| context-compressor | yes | yes | fail | yes | yes | memory | yes | medium |
| context-driven-development | yes | yes | fail | yes | yes | memory | yes | medium |
| cpp | yes | yes | fail | yes | yes | languages | yes | high |
| creators | no | no | n/a | no | no | other | yes | medium |
| data-expert | yes | yes | fail | yes | yes | database | yes | medium |
| database-architect | yes | yes | fail | yes | yes | database | yes | medium |
| database-expert | yes | yes | fail | yes | yes | database | yes | medium |
| debugging | yes | yes | fail | yes | yes | development | yes | medium |
| dependency-analyzer | yes | yes | fail | yes | yes | specialized | yes | medium |
| design-and-user-experience-guidelines | yes | yes | fail | yes | yes | styling | yes | medium |
| diagram-generator | yes | yes | fail | yes | yes | architecture | yes | medium |
| differential-review | yes | yes | fail | yes | yes | other | yes | medium |
| doc-generator | yes | yes | fail | yes | yes | documentation | yes | medium |
| docker-compose | yes | yes | fail | yes | yes | devops | yes | high |
| dry-principle | yes | yes | fail | yes | yes | other | yes | medium |
| dto-conventions | yes | yes | fail | yes | yes | other | yes | medium |
| expo-framework-rule | yes | yes | fail | yes | yes | mobile | yes | medium |
| expo-mobile-app-rule | yes | yes | fail | yes | yes | mobile | yes | medium |
| filesystem | yes | yes | fail | yes | yes | specialized | yes | medium |
| form-and-actions-in-sveltekit | yes | yes | fail | yes | yes | other | yes | medium |
| form-validation-with-zod | yes | yes | fail | yes | yes | other | yes | medium |
| frontend-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| function-length-and-responsibility | yes | yes | fail | yes | yes | other | yes | medium |
| gamedev-expert | yes | yes | fail | yes | yes | other | yes | medium |
| gcloud-cli | yes | yes | fail | yes | yes | devops | yes | high |
| git-expert | yes | yes | fail | yes | yes | git | yes | medium |
| github-mcp | yes | yes | fail | yes | yes | integration | yes | high |
| gitops-workflow | yes | yes | fail | yes | yes | git | yes | medium |
| go-expert | yes | yes | fail | yes | yes | languages | yes | high |
| graphql-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| helm-chart-scaffolding | yes | yes | fail | yes | yes | devops | yes | high |
| hook-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| html-tailwind-css-and-javascript-expert-rule | yes | yes | fail | yes | yes | styling | yes | medium |
| incident-runbook-templates | yes | yes | fail | yes | yes | devops | yes | high |
| insecure-defaults | yes | yes | fail | yes | yes | other | yes | medium |
| insight-extraction | yes | yes | fail | yes | yes | specialized | yes | medium |
| integration | no | no | n/a | no | no | other | yes | medium |
| interactive-requirements-gathering | yes | yes | fail | yes | yes | requirements | yes | medium |
| ios-expert | yes | yes | fail | yes | yes | mobile | yes | medium |
| java-expert | yes | yes | fail | yes | yes | languages | yes | high |
| jupyter-notebook-best-practices | yes | yes | fail | yes | yes | languages | yes | high |
| k8s-manifest-generator | yes | yes | fail | yes | yes | devops | yes | high |
| k8s-security-policies | yes | yes | fail | yes | yes | devops | yes | high |
| kubernetes-flux | yes | yes | fail | yes | yes | devops | yes | high |
| logging-module-usage | yes | yes | fail | yes | yes | development | yes | medium |
| memory-forensics | yes | yes | fail | yes | yes | security | yes | high |
| mobile-first-design-rules | yes | yes | fail | yes | yes | mobile | yes | medium |
| mobile-ui-development-rule | yes | yes | fail | yes | yes | mobile | yes | medium |
| nextjs-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| nodejs-expert | yes | yes | fail | yes | yes | languages | yes | high |
| on-call-handoff-patterns | yes | yes | fail | yes | yes | devops | yes | high |
| pandas-data-manipulation-rules | yes | yes | fail | yes | yes | database | yes | medium |
| php-expert | yes | yes | fail | yes | yes | languages | yes | high |
| plan-generator | yes | yes | fail | yes | yes | planning | yes | medium |
| planning-with-files | yes | yes | fail | yes | yes | other | yes | medium |
| postmortem-writing | yes | yes | fail | yes | yes | devops | yes | high |
| prd-generator | yes | yes | fail | yes | yes | other | yes | medium |
| prioritize-python-3-10-features | yes | yes | fail | yes | yes | languages | yes | high |
| project-analyzer | yes | yes | fail | yes | yes | memory | yes | medium |
| project-onboarding | yes | yes | fail | yes | yes | memory | yes | medium |
| protocol-reverse-engineering | yes | yes | fail | yes | yes | security | yes | high |
| python-backend-expert | yes | yes | fail | yes | yes | languages | yes | high |
| react-best-practices-vercel | yes | yes | pass | yes | yes | frameworks | yes | medium |
| react-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| react-native-skills-vercel | yes | yes | pass | yes | yes | mobile | yes | medium |
| readme | yes | yes | fail | yes | yes | documentation | yes | medium |
| recovery | yes | yes | fail | yes | yes | memory | yes | medium |
| research-synthesis | yes | yes | fail | yes | yes | research | yes | medium |
| response-rater | yes | yes | fail | yes | yes | quality | yes | medium |
| restcontroller-conventions | yes | yes | fail | yes | yes | other | yes | medium |
| ripgrep | yes | yes | fail | yes | yes | development | yes | medium |
| rule-auditor | yes | yes | fail | yes | yes | other | yes | medium |
| rust-expert | yes | yes | fail | yes | yes | other | yes | medium |
| schema-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| scientific-skills | yes | yes | fail | yes | yes | scientific | yes | medium |
| security-architect | yes | yes | fail | yes | yes | security | yes | high |
| semgrep-rule-creator | yes | yes | fail | yes | yes | other | yes | medium |
| sentry-monitoring | yes | yes | fail | yes | yes | devops | yes | high |
| seo-and-meta-tags-in-sveltekit | yes | yes | fail | yes | yes | other | yes | medium |
| sequential-thinking | yes | yes | fail | yes | yes | specialized | yes | medium |
| service-class-conventions | yes | yes | fail | yes | yes | other | yes | medium |
| session-handoff | yes | yes | fail | yes | yes | memory | yes | medium |
| skill-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| skill-discovery | yes | yes | fail | yes | yes | specialized | yes | medium |
| slack-notifications | yes | yes | fail | yes | yes | integration | yes | high |
| smart-debug | yes | yes | fail | yes | yes | specialized | yes | medium |
| sparc-methodology | yes | yes | fail | yes | yes | other | yes | medium |
| spec-gathering | yes | yes | fail | yes | yes | requirements | yes | medium |
| spec-init | yes | yes | fail | yes | yes | other | yes | medium |
| state-management-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| static-analysis | yes | yes | fail | yes | yes | other | yes | medium |
| styling-expert | yes | yes | fail | yes | yes | styling | yes | medium |
| summarize-changes | yes | yes | fail | yes | yes | specialized | yes | medium |
| svelte-expert | yes | yes | fail | yes | yes | frameworks | yes | medium |
| swarm-coordination | yes | yes | fail | yes | yes | specialized | yes | medium |
| tall-stack-general | yes | yes | fail | yes | yes | other | yes | medium |
| task-management-protocol | yes | yes | fail | yes | yes | specialized | yes | medium |
| tauri-native-api-integration | yes | yes | fail | yes | yes | other | yes | medium |
| tauri-security-rules | yes | yes | fail | yes | yes | other | yes | medium |
| tauri-svelte-typescript-general | yes | yes | fail | yes | yes | other | yes | medium |
| tauri-svelte-ui-components | yes | yes | fail | yes | yes | other | yes | medium |
| tdd | yes | yes | fail | yes | yes | development | yes | medium |
| template-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| template-renderer | yes | yes | fail | yes | yes | creator | yes | medium |
| terraform-infra | yes | yes | fail | yes | yes | devops | yes | high |
| test-generator | yes | yes | fail | yes | yes | development | yes | medium |
| text-to-sql | yes | yes | fail | yes | yes | database | yes | medium |
| thinking-tools | yes | yes | fail | yes | yes | specialized | yes | medium |
| tool-search | yes | yes | fail | yes | yes | specialized | yes | medium |
| track-management | yes | yes | fail | yes | yes | specialized | yes | medium |
| tsconfig-json-rules | yes | yes | fail | yes | yes | other | yes | medium |
| typescript-expert | yes | yes | fail | yes | yes | languages | yes | high |
| ui-components-expert | yes | yes | fail | yes | yes | styling | yes | medium |
| variant-analysis | yes | yes | fail | yes | yes | other | yes | medium |
| verification-before-completion | yes | yes | fail | yes | yes | quality | yes | medium |
| visual-and-observational-rules | yes | yes | fail | yes | yes | styling | yes | medium |
| web-design-guidelines-vercel | yes | yes | pass | yes | yes | styling | yes | medium |
| web3-expert | yes | yes | fail | yes | yes | integration | yes | high |
| workflow-creator | yes | yes | fail | yes | yes | creator | yes | medium |
| workflow-patterns | yes | yes | fail | yes | yes | specialized | yes | medium |
| writing-skills | yes | yes | fail | yes | yes | documentation | yes | medium |

