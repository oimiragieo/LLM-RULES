#!/bin/bash
# validate-sync.sh - Validates cross-platform sync and configuration integrity
# Run: bash scripts/validation/validate-sync.sh [--strict]
#
# WINDOWS COMPATIBILITY NOTE:
# This script requires bash and Unix utilities (find, awk, wc).
# On Windows, run via Git Bash, WSL, Cygwin, or MSYS2.
#
# Prefer the Node.js validator for cross-platform automation:
#   node scripts/validation/validate-sync.mjs [--strict]

set -e

echo "=========================================="
echo "Agent Studio Configuration Validation"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0
STRICT_WARNINGS=0

for arg in "$@"; do
    case "$arg" in
        --strict)
            STRICT_WARNINGS=1
            ;;
        -h|--help)
            echo "Usage: bash scripts/validation/validate-sync.sh [--strict]"
            exit 0
            ;;
        *)
            echo "[ERROR] Unknown option: $arg"
            exit 1
            ;;
    esac
done

case "${VALIDATE_SYNC_STRICT:-}" in
    1|true|TRUE|True)
        STRICT_WARNINGS=1
        ;;
esac

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERRORS += 1))
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS += 1))
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

info() {
    echo "[INFO] $1"
}

count_files() {
    local dir="$1"
    local name="$2"

    if [ -d "$dir" ]; then
        find "$dir" -type f -name "$name" 2>/dev/null | wc -l | tr -d '[:space:]'
    else
        echo 0
    fi
}

count_cursor_skill_files() {
    if [ -d ".cursor/skills" ]; then
        find .cursor/skills -type f \( -name "*.md" -o -name "*.mdc" \) 2>/dev/null | wc -l | tr -d '[:space:]'
    else
        echo 0
    fi
}

extract_cursor_routed_agents() {
    local config_file="$1"

    awk '
        /^agent_routing:[[:space:]]*$/ {
            in_routing = 1
            next
        }

        in_routing && /^[^[:space:]#][^:]*:[[:space:]]*$/ {
            exit
        }

        in_routing && /^  [a-z0-9-]+:[[:space:]]*$/ {
            agent = $0
            sub(/^[[:space:]]+/, "", agent)
            sub(/:[[:space:]]*$/, "", agent)
            print agent
        }
    ' "$config_file"
}

# ====================
# 1. Bundle Inventory
# ====================
echo "1. Validating Bundle Inventory"
echo "-------------------------------------------"

CLAUDE_AGENTS=$(count_files ".claude/agents" "*.md")
CURSOR_AGENTS=$(count_files ".cursor/subagents" "*.mdc")
FACTORY_SKILLS=$(count_files ".factory/skills" "SKILL.md")

info "Claude agents: $CLAUDE_AGENTS"
info "Cursor subagents: $CURSOR_AGENTS"
info "Factory worker skills: $FACTORY_SKILLS"

if [ "$CLAUDE_AGENTS" -gt 0 ]; then
    success "Claude canonical agent catalog is present"
else
    error "Claude canonical agent catalog is empty"
fi

if [ "$CURSOR_AGENTS" -gt 0 ]; then
    success "Cursor curated subagent bundle is present"
else
    error "Cursor subagent bundle is empty"
fi

if [ "$FACTORY_SKILLS" -gt 0 ]; then
    success "Factory worker skill bundle is present"
else
    error "Factory worker skill bundle is empty"
fi

# ====================
# 2. Cursor Directory/File Checks
# ====================
echo ""
echo "2. Validating Cursor Directory Structure"
echo "-------------------------------------------"

if [ -d ".cursor/plans" ]; then
    info ".cursor/plans/ directory exists (runtime-created, may be empty)"
else
    info ".cursor/plans/ directory not found (will be created at runtime)"
fi

if [ -d ".cursor/subagents" ]; then
    CURSOR_SUBAGENTS=$(count_files ".cursor/subagents" "*.mdc")
    ROUTED_AGENT_COUNT=0
    MISSING_ROUTED_AGENTS=()

    info "Cursor subagents: $CURSOR_SUBAGENTS"

    if [ -f ".cursor/config.yaml" ]; then
        while IFS= read -r agent; do
            [ -n "$agent" ] || continue
            ROUTED_AGENT_COUNT=$((ROUTED_AGENT_COUNT + 1))
            cursor_file=".cursor/subagents/${agent}.mdc"

            if [ -f "$cursor_file" ]; then
                success "Cursor routed agent '$agent' has matching subagent file"
            else
                MISSING_ROUTED_AGENTS+=("$agent")
            fi
        done < <(extract_cursor_routed_agents ".cursor/config.yaml")

        if [ "${#MISSING_ROUTED_AGENTS[@]}" -eq 0 ]; then
            success "Cursor routed agents are backed by subagent files ($ROUTED_AGENT_COUNT checked)"
        else
            error "Cursor config references missing subagents: ${MISSING_ROUTED_AGENTS[*]}"
        fi
    else
        error ".cursor/config.yaml missing"
    fi
else
    error ".cursor/subagents/ directory not found"
fi

# ====================
# 3. Skill Parity Checks
# ====================
echo ""
echo "3. Validating Skill Parity"
echo "-------------------------------------------"

CLAUDE_SKILLS=$(count_files ".claude/skills" "SKILL.md")
CURSOR_SKILLS=$(count_cursor_skill_files)
REQUIRED_CURSOR_SKILLS=(
    "artifact-publisher"
    "context-bridge"
    "handoff"
    "repo-index"
    "repo-rag"
    "rule-auditor"
    "rule-selector"
    "scaffolder"
)

info "Claude skills: $CLAUDE_SKILLS"

if [ -d ".cursor/skills" ]; then
    MISSING_CURSOR_SKILLS=()

    info "Cursor skills: $CURSOR_SKILLS"

    for skill in "${REQUIRED_CURSOR_SKILLS[@]}"; do
        if [ -f ".cursor/skills/${skill}.md" ] || \
           [ -f ".cursor/skills/${skill}/SKILL.md" ] || \
           [ -f ".cursor/skills/${skill}/SKILL.mdc" ]; then
            success "Required Cursor utility skill '$skill' is present"
        else
            MISSING_CURSOR_SKILLS+=("$skill")
        fi
    done

    if [ "${#MISSING_CURSOR_SKILLS[@]}" -eq 0 ]; then
        success "Required Cursor utility skills are present"
    else
        error "Missing Cursor utility skills: ${MISSING_CURSOR_SKILLS[*]}"
    fi
else
    error "Cursor skills directory not found"
fi

if [ -d ".factory/skills" ]; then
    info "Factory worker skills: $FACTORY_SKILLS"
    success "Factory uses .factory/skills worker contracts"
else
    error "Factory skills directory not found"
fi

# ====================
# 4. Documentation Consistency
# ====================
echo ""
echo "4. Documentation Consistency"
echo "-------------------------------------------"

if [ -f "README.md" ]; then
    readme_count=$(grep -oE "[0-9]+ (specialized )?agents" README.md 2>/dev/null | head -1 | grep -oE "[0-9]+" || true)
    if [ -n "$readme_count" ]; then
        if [ "$readme_count" -eq "$CLAUDE_AGENTS" ]; then
            success "README.md agent count ($readme_count) matches actual count ($CLAUDE_AGENTS)"
        else
            warning "README.md claims $readme_count agents but found $CLAUDE_AGENTS"
        fi
    fi
fi

if [ -f ".claude/CLAUDE.md" ]; then
    success ".claude/CLAUDE.md exists (canonical location)"
else
    error ".claude/CLAUDE.md missing (required for Claude Code)"
fi

if [ -f "GETTING_STARTED.md" ]; then
    success "GETTING_STARTED.md quick start guide exists"
else
    warning "GETTING_STARTED.md missing (recommended for onboarding)"
fi

# ====================
# 5. Required Files Check
# ====================
echo ""
echo "5. Required Files Check"
echo "-------------------------------------------"

required_files=(
    ".claude/config.yaml"
    ".claude/settings.json"
    ".claude/CLAUDE.md"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        success "Required file exists: $file"
    else
        error "Required file missing: $file"
    fi
done

# ====================
# Summary
# ====================
echo ""
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}$WARNINGS warning(s), 0 errors${NC}"
    if [ "$STRICT_WARNINGS" -eq 1 ]; then
        echo -e "${RED}Strict mode: warnings treated as errors${NC}"
        exit 1
    fi
    exit 0
else
    echo -e "${RED}$ERRORS error(s), $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before deploying."
    exit 1
fi
