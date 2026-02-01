# Agent–Skill–Workflow Review

This document reviews the **implemented CLI/in-repo skills** and ensures agents, hooks, and workflows are aligned with how each skill is intended to be used.

**Note:** Ebooks were not downloaded (copyright). Skill data is derived from **free/official certifications, training syllabi, and docs** and added under "Certifications & Training" and "Hooks & Workflows" in each skill's SKILL.md.

---

## 1. Git Expert

| Item            | Assignment                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| **Agents**      | **developer** (primary), **devops** (always)                                                               |
| **Hooks**       | Pre-commit: run **commit-validator**. Pre-push: tests (reference **verification-before-completion**).      |
| **Workflows**   | Feature development, code review; use with **github-ops** or **github-mcp** for PR/create.                 |
| **Correct use** | All git CLI operations (branch, add, commit, push, merge, rebase). Never force-push; never commit secrets. |

---

## 2. AWS Cloud Ops

| Item            | Assignment                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Agents**      | **devops** (contextual: `aws_project`)                                                     |
| **Hooks**       | Optional: pre-deploy validate identity (`aws sts get-caller-identity`).                    |
| **Workflows**   | AWS resource ops (S3, Lambda, CloudWatch, EC2, IAM); incident-response when debugging AWS. |
| **Correct use** | Use when task involves AWS CLI; IAM roles over keys; describe before destructive ops.      |

---

## 3. GCloud CLI

| Item            | Assignment                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| **Agents**      | **devops** (contextual: `gcp_project`)                                              |
| **Hooks**       | Optional: pre-deploy `gcloud config get-value project`.                             |
| **Workflows**   | GCP resource ops; use when project or task is GCP.                                  |
| **Correct use** | Use when task involves GCP; named configs for dev/staging/prod; no exposed SA keys. |

---

## 4. Docker Compose

| Item            | Assignment                                                                |
| --------------- | ------------------------------------------------------------------------- |
| **Agents**      | **devops** (primary), **devops-troubleshooter** (primary)                 |
| **Hooks**       | Pre-up: `docker compose config` (validate).                               |
| **Workflows**   | Local/CI multi-container; incident-response for container debugging.      |
| **Correct use** | Compose YAML validate → up/down/exec; use healthchecks and named volumes. |

---

## 5. Kubernetes Flux

| Item            | Assignment                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| **Agents**      | **devops** (always)                                                               |
| **Hooks**       | Optional: pre-apply `flux check`; post-push to Git used by Flux: reconcile.       |
| **Workflows**   | GitOps bootstrap/reconcile; debug with `flux get all`, `flux tree kustomization`. |
| **Correct use** | Use for GitOps clusters; Flux CLI for status/reconcile, not general kubectl.      |

---

## 6. Terraform Infra

| Item            | Assignment                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **Agents**      | **devops** (primary)                                                                                |
| **Hooks**       | Pre-apply: run `terraform plan -out=tfplan` and gate on review; CI: apply only after plan approval. |
| **Workflows**   | init → plan → review → apply; state commands for debugging; ci-cd for pipelines.                    |
| **Correct use** | Always plan before apply; remote state + lock; no blind apply.                                      |

---

## 7. GitHub Ops

| Item            | Assignment                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Agents**      | **developer** (secondary), **devops** (github-mcp in always; use github-ops for CLI)       |
| **Hooks**       | Optional: post-commit remind to push and open PR.                                          |
| **Workflows**   | PR create/list/checkout/view; issue create/search; use with **git-expert** for full flow.  |
| **Correct use** | Use `gh` CLI for scriptable PR/issue ops; use **github-mcp** when MCP tools are preferred. |

---

## 8. Code Analyzer

| Item            | Assignment                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Agents**      | **developer** (secondary), **qa** (secondary), **code-reviewer** (primary), **c4-code** (primary) |
| **Hooks**       | Pre-commit or CI: run project-analyzer/doctor; optional complexity gate.                          |
| **Workflows**   | Code review workflow; run analyzer → hotspots → refactor or add tests.                            |
| **Correct use** | Static analysis and complexity metrics; analyze before refactor; focus on hotspots.               |

---

## 9. Code Style Validator

| Item            | Assignment                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| **Agents**      | **developer** (secondary), **code-reviewer** (secondary), **qa** (CI)                   |
| **Hooks**       | Pre-commit: run security-lint (skill script) or ESLint; block on failure.               |
| **Workflows**   | Before commit or in CI → run validator → fix or block; see enterprise/code-review.yaml. |
| **Correct use** | AST-based style validation; pre-commit/CI; auto-fix where possible.                     |

---

## 10. Chrome Browser

| Item            | Assignment                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Agents**      | **qa** (contextual: `browser_testing`)                                                            |
| **Hooks**       | Optional: post-test screenshot on failure.                                                        |
| **Workflows**   | E2E/browser testing; see `.claude/workflows/chrome-browser-skill-workflow.md`.                    |
| **Correct use** | Test user-visible behavior; DevTools MCP for debugging; Claude-in-Chrome for authenticated flows. |

---

## 11. MCP Converter

| Item            | Assignment                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Agents**      | **evolution-orchestrator** (secondary)                                                          |
| **Hooks**       | Optional: post–MCP config change run batch_converter to refresh skills.                         |
| **Workflows**   | List servers → convert server or batch → test converted skill; feeds skill-creator input.       |
| **Correct use** | Convert MCP servers to skills; use catalog + batch_converter; single responsibility per server. |

---

## 12. Sequential Thinking

| Item            | Assignment                                                                                |
| --------------- | ----------------------------------------------------------------------------------------- |
| **Agents**      | **planner** (primary), **master-orchestrator** (when decomposing work)                    |
| **Hooks**       | Optional: pre-plan or pre-complex-task suggest sequential-thinking for multi-step tasks.  |
| **Workflows**   | Complex task → load sequential-thinking → emit thoughts (MCP or executor) → revise → act. |
| **Correct use** | Multi-step analysis, planning, hypothesis verification; Polya/IDEAL-style steps.          |

---

## Matrix and Trigger Updates Applied

- **developer:** Added **github-ops** to secondary (CLI PR/issue ops alongside github-mcp).
- **evolution-orchestrator:** Added **mcp-converter** to secondary (convert MCP → skills).
- **qa:** Added contextual **browser_testing** → **chrome-browser**.
- **skillCategories:** Added **mcp-converter** to creators; added **testing** category (chrome-browser, testing-expert, qa-workflow).
- **contextualTriggers:** Added **browser_testing** (keywords: e2e, browser, chrome, playwright, cypress, selenium, devtools).

---

## How to Use This Review

1. **Router:** When routing a task, use agent primary/secondary/contextual and contextualTriggers so the right skill is loaded (e.g. `aws_project` → devops + aws-cloud-ops; `browser_testing` → qa + chrome-browser).
2. **Hooks:** Implement or enable the suggested hooks (e.g. pre-commit commit-validator, pre-apply terraform plan gate) so skills are used in the intended workflow.
3. **Workflows:** Reference the workflows listed above and the skill’s "Hooks & Workflows" section when designing new workflows or updating existing ones (e.g. enterprise/code-review.yaml, operations/incident-response).
4. **Certifications & Training:** Each skill’s SKILL.md now includes a "Certifications & Training" section (free/official certs and training) and "Skill data" bullets; use these for onboarding and for refining skill behavior, not for downloading copyrighted ebooks.
