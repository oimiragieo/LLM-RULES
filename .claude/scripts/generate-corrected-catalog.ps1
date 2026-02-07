# Generate corrected skill catalog after dead skills archival
# Pipeline #16B: Skills System Structural Cleanup

$catalogPath = "C:\dev\projects\agent-studio\.claude\context\artifacts\catalogs\skill-catalog.md"
$outputPath = "C:\dev\projects\agent-studio\.claude\context\artifacts\catalogs\skill-catalog-new.md"

# Active skills (87 + 1 deprecated alias + 1 scientific-skills parent = 89 total)
$activeSkills = @(
    "accessibility", "advanced-elicitation", "agent-creator", "ai-ml-expert",
    "android-expert", "api-development-expert", "architecture-review",
    "auth-security-expert", "best-practices-guidelines", "binary-analysis-patterns",
    "checklist-generator", "code-analyzer", "code-quality-expert", "code-semantic-search",
    "code-structural-search", "code-style-validator", "complexity-assessment",
    "consensus-voting", "container-expert", "context-compressor",
    "context-driven-development", "database-architect", "database-expert",
    "data-expert", "debugging", "diagram-generator", "doc-generator", "docker-compose",
    "dry-principle", "expo-framework-rule", "frontend-expert", "gamedev-expert",
    "git-expert", "go-expert", "graphql-expert", "hook-creator",
    "incident-runbook-templates", "insight-extraction", "interactive-requirements-gathering",
    "ios-expert", "java-expert", "k8s-manifest-generator", "memory-forensics",
    "mobile-first-design-rules", "nextjs-expert", "nodejs-expert",
    "on-call-handoff-patterns", "php-expert", "plan-generator", "planning-with-files",
    "postmortem-writing", "project-onboarding", "protocol-reverse-engineering",
    "python-backend-expert", "react-expert", "readme", "research-synthesis",
    "response-rater", "ripgrep", "schema-creator", "scientific-skills",
    "security-architect", "sentry-monitoring", "sequential-thinking", "session-handoff",
    "skill-creator", "sparc-methodology", "spec-gathering", "spec-init",
    "summarize-changes", "svelte-expert", "swarm-coordination", "task-management-protocol",
    "tauri-native-api-integration", "tdd", "template-creator", "terraform-infra",
    "test-generator", "text-to-sql", "thinking-tools", "track-management",
    "typescript-expert", "verification-before-completion", "web3-expert",
    "workflow-creator", "workflow-patterns", "writing-skills"
)

Write-Host "Active skills count: $($activeSkills.Count)"
Write-Host "Expected: 87 active + 1 deprecated alias (testing-expert) + 1 parent (scientific-skills) = 89 total"

# Save list for reference
$activeSkills | Out-File "C:\dev\projects\agent-studio\.claude\scripts\active-skills-list.txt"
Write-Host "Active skills list saved to: .claude/scripts/active-skills-list.txt"
