<!-- Agent: codex | Task: restored-skills-onboarding-freshness | Session: 2026-02-13 -->

# Restored Skills Onboarding and Freshness Audit (2026-02-13)

## Scope

- Audited restored skills from commit `e6068281`: **58**
- Registration check: `.claude/config/skill-index.json`
- Agent visibility check: `.claude/agents/**` frontmatter `skills:`
- External freshness pass: Exa web search across each restored skill topic (batch run, February 13, 2026)

## Summary

- Registered in index: **58/58**
- Referenced by agents: **58/58**
- Freshness confidence buckets: **high** (official docs-backed), **medium** (mixed/secondary), **low** (none)

## Per-Skill Matrix

| Skill                                        | Registered | Agent-Referenced | Exa Researched | Confidence |
| -------------------------------------------- | ---------- | ---------------- | -------------- | ---------- |
| artifact-lifecycle                           | yes        | yes              | yes            | medium     |
| arxiv-mcp                                    | yes        | yes              | yes            | high       |
| async-operations                             | yes        | yes              | yes            | medium     |
| aws-cloud-ops                                | yes        | yes              | yes            | medium     |
| build-tools-expert                           | yes        | yes              | yes            | medium     |
| chrome-browser                               | yes        | yes              | yes            | medium     |
| ci-cd-implementation-rule                    | yes        | yes              | yes            | medium     |
| cloud-devops-expert                          | yes        | yes              | yes            | medium     |
| composer-dependency-management               | yes        | yes              | yes            | medium     |
| comprehensive-type-annotations               | yes        | yes              | yes            | high       |
| comprehensive-unit-testing-with-pytest       | yes        | yes              | yes            | high       |
| configuration-management                     | yes        | yes              | yes            | medium     |
| containerization-rules                       | yes        | yes              | yes            | high       |
| cpp                                          | yes        | yes              | yes            | high       |
| dependency-analyzer                          | yes        | yes              | yes            | medium     |
| design-and-user-experience-guidelines        | yes        | yes              | yes            | medium     |
| dto-conventions                              | yes        | yes              | yes            | medium     |
| expo-mobile-app-rule                         | yes        | yes              | yes            | medium     |
| filesystem                                   | yes        | yes              | yes            | medium     |
| form-and-actions-in-sveltekit                | yes        | yes              | yes            | medium     |
| form-validation-with-zod                     | yes        | yes              | yes            | medium     |
| function-length-and-responsibility           | yes        | yes              | yes            | medium     |
| gcloud-cli                                   | yes        | yes              | yes            | high       |
| github-mcp                                   | yes        | yes              | yes            | high       |
| gitops-workflow                              | yes        | yes              | yes            | medium     |
| helm-chart-scaffolding                       | yes        | yes              | yes            | high       |
| html-tailwind-css-and-javascript-expert-rule | yes        | yes              | yes            | medium     |
| jupyter-notebook-best-practices              | yes        | yes              | yes            | medium     |
| k8s-security-policies                        | yes        | yes              | yes            | high       |
| kubernetes-flux                              | yes        | yes              | yes            | high       |
| logging-module-usage                         | yes        | yes              | yes            | medium     |
| mobile-ui-development-rule                   | yes        | yes              | yes            | medium     |
| pandas-data-manipulation-rules               | yes        | yes              | yes            | medium     |
| prioritize-python-3-10-features              | yes        | yes              | yes            | high       |
| project-analyzer                             | yes        | yes              | yes            | medium     |
| react-best-practices-vercel                  | yes        | yes              | yes            | high       |
| react-native-skills-vercel                   | yes        | yes              | yes            | high       |
| recovery                                     | yes        | yes              | yes            | medium     |
| restcontroller-conventions                   | yes        | yes              | yes            | medium     |
| rule-auditor                                 | yes        | yes              | yes            | medium     |
| rust-expert                                  | yes        | yes              | yes            | medium     |
| seo-and-meta-tags-in-sveltekit               | yes        | yes              | yes            | high       |
| service-class-conventions                    | yes        | yes              | yes            | medium     |
| skill-discovery                              | yes        | yes              | yes            | medium     |
| slack-notifications                          | yes        | yes              | yes            | high       |
| smart-debug                                  | yes        | yes              | yes            | medium     |
| state-management-expert                      | yes        | yes              | yes            | medium     |
| styling-expert                               | yes        | yes              | yes            | medium     |
| tall-stack-general                           | yes        | yes              | yes            | medium     |
| tauri-security-rules                         | yes        | yes              | yes            | high       |
| tauri-svelte-typescript-general              | yes        | yes              | yes            | high       |
| tauri-svelte-ui-components                   | yes        | yes              | yes            | medium     |
| template-renderer                            | yes        | yes              | yes            | medium     |
| tool-search                                  | yes        | yes              | yes            | high       |
| tsconfig-json-rules                          | yes        | yes              | yes            | high       |
| ui-components-expert                         | yes        | yes              | yes            | medium     |
| visual-and-observational-rules               | yes        | yes              | yes            | medium     |
| web-design-guidelines-vercel                 | yes        | yes              | yes            | high       |

## Notes

- Some Exa queries returned secondary/blog sources; replace those with primary sources during next skill refresh.
- Strict `skill-creator` minimal frontmatter validation fails for most framework skills due extended metadata schema used by this repo.

## Recommended Next Update Pass

1. Normalize high-impact skills first (`github-mcp`, `kubernetes-flux`, `tauri-security-rules`, `web-design-guidelines-vercel`, `template-renderer`).
2. For each skill, pin at least one primary source URL in `references/` with retrieval date.
3. Add a periodic freshness-check workflow (monthly) that emits a diff report.
