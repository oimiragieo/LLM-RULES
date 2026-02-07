# Archive dead skills to .claude/skills/_archive/dead/
# Pipeline #16B: Skills System Structural Cleanup

$projectRoot = "C:\dev\projects\agent-studio"
$skillsDir = Join-Path $projectRoot ".claude\skills"
$archiveDir = Join-Path $skillsDir "_archive\dead"

# Active skills list (93 skills that should remain)
$activeSkills = @(
    "accessibility", "agent-creator", "ai-ml-expert", "android-expert",
    "api-development-expert", "architecture-review", "auth-security-expert",
    "best-practices-guidelines", "binary-analysis-patterns", "checklist-generator",
    "code-analyzer", "code-quality-expert", "code-semantic-search", "code-structural-search",
    "code-style-validator", "complexity-assessment", "consensus-voting", "container-expert",
    "context-compressor", "context-driven-development", "database-architect", "database-expert",
    "data-expert", "debugging", "diagram-generator", "doc-generator", "docker-compose",
    "dry-principle", "expo-framework-rule", "frontend-expert", "gamedev-expert", "git-expert",
    "go-expert", "graphql-expert", "hook-creator", "incident-runbook-templates",
    "insight-extraction", "interactive-requirements-gathering", "ios-expert", "java-expert",
    "k8s-manifest-generator", "memory-forensics", "mobile-first-design-rules", "nextjs-expert",
    "nodejs-expert", "on-call-handoff-patterns", "php-expert", "plan-generator",
    "postmortem-writing", "project-onboarding", "protocol-reverse-engineering",
    "python-backend-expert", "react-expert", "readme", "research-synthesis", "response-rater",
    "ripgrep", "schema-creator", "scientific-skills", "security-architect", "sentry-monitoring",
    "sequential-thinking", "session-handoff", "skill-creator", "spec-gathering",
    "summarize-changes", "svelte-expert", "swarm-coordination", "task-management-protocol",
    "tauri-native-api-integration", "tdd", "template-creator", "terraform-infra",
    "test-generator", "text-to-sql", "thinking-tools", "track-management", "typescript-expert",
    "verification-before-completion", "web3-expert", "workflow-creator", "workflow-patterns",
    "writing-skills", "advanced-elicitation", "planning-with-files", "sparc-methodology",
    "spec-init"
)

# Get all current skill directories (excluding _archive)
$allSkills = Get-ChildItem -Path $skillsDir -Directory | Where-Object { $_.Name -ne "_archive" } | Select-Object -ExpandProperty Name

# Find skills to archive (not in active list)
$skillsToArchive = $allSkills | Where-Object { $activeSkills -notcontains $_ }

Write-Host "Skills to archive: $($skillsToArchive.Count)"
Write-Host "First 10 to archive:"
$skillsToArchive | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" }

# Archive each skill
$archived = 0
$failed = 0

foreach ($skill in $skillsToArchive) {
    $sourcePath = Join-Path $skillsDir $skill
    $destPath = Join-Path $archiveDir $skill

    if (Test-Path $sourcePath) {
        try {
            Move-Item -Path $sourcePath -Destination $destPath -Force -ErrorAction Stop
            $archived++
            if ($archived % 20 -eq 0) {
                Write-Host "Archived $archived skills..."
            }
        }
        catch {
            Write-Host "Failed to archive $skill : $_"
            $failed++
        }
    }
}

Write-Host "`nArchival complete!"
Write-Host "  Archived: $archived"
Write-Host "  Failed: $failed"
Write-Host "  Remaining skills: $(($allSkills.Count - $archived))"
