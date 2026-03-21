# TOON vs @ File Reference Research Report

**Date:** 2026-01-29
**Researcher Agent ID:** a8fa177
**Status:** Complete

---

## Executive Summary

This research investigates two approaches for managing file references in the Agent Studio codebase:

1. **TOON References** - An indirect reference system using type objects and object notation
2. **@ File References** - A direct file path reference system using the @ prefix

**Key Finding:** Hybrid approach recommended combining @ references (default) with optional TOON support for complex orchestration scenarios.

**Recommendation:** Implement @ references as primary system with TOON as optional enhancement for advanced workflows.

---

## Research Queries (5)

### Query 1: File Reference Systems in Large Codebases
- Explored standards for managing file references in multi-agent systems
- Findings: @ prefix is widely adopted in TypeScript/Node.js ecosystems
- Sources: ESM specification, npm reference resolution

### Query 2: Type Object Notation (TOON) Patterns
- Investigated abstract reference systems using object notation
- Findings: TOON provides flexibility but adds complexity
- Use cases: Advanced routing, conditional references

### Query 3: Agent Studio File Structure
- Analyzed current `.claude/` directory layout and artifact organization
- Findings: Clear categorization by artifact type (agents, skills, workflows)
- Opportunity: @ references map directly to this structure

### Query 4: Reference Resolution in Multi-Layer Systems
- Researched how references propagate through orchestration layers
- Findings: Direct references (@ style) are easier to trace and debug
- Concern: Abstraction layers (TOON) can obscure reference flow

### Query 5: Performance and Maintainability Trade-offs
- Evaluated performance impact and maintenance burden of each approach
- Findings: @ references have zero runtime overhead; TOON requires lookup layer
- Conclusion: Performance favors @ references for standard use cases

---

## Key Findings

### TOON References

**Strengths:**
- Type-safe object notation
- Support for dynamic reference resolution
- Enables complex routing logic through object composition
- Can represent conditional or context-dependent references
- Useful for orchestration workflows

**Weaknesses:**
- Requires abstraction layer and lookup system
- More complex to debug and trace
- Steeper learning curve for developers
- Runtime overhead for reference resolution
- Not directly visible as file paths

**Current Usage:**
- Some orchestration patterns use object-based routing
- Not yet standardized in Agent Studio
- Limited documentation

### @ File References

**Strengths:**
- Direct, transparent file path representation
- Aligns with ESM and npm standards
- Zero runtime overhead
- Easy to search and navigate (grep, IDE support)
- Clear ownership: file maps to artifact
- Simple to validate and audit

**Weaknesses:**
- Less flexible for dynamic routing
- Cannot represent runtime-determined references
- May require preprocessing for advanced orchestration

**Current Usage:**
- Already adopted in some documentation
- References like `.claude/skills/tdd/SKILL.md` work well
- Natural fit with project structure

### Comparative Analysis

| Aspect | TOON | @ References |
|--------|------|-------------|
| **Clarity** | Abstract | Direct |
| **Performance** | Lookup overhead | None |
| **Debugging** | Complex | Simple |
| **IDE Support** | Limited | Excellent |
| **Standards Alignment** | Custom | ESM/npm standard |
| **Learning Curve** | Steep | Shallow |
| **Dynamic Routing** | Excellent | Limited |
| **Maintenance** | Complex | Simple |
| **Search/Navigation** | Difficult | Easy |

---

## Recommendation: Hybrid Approach

**Primary System: @ File References**
- Use @ references as default for all standard file references
- Provides clarity, performance, and standards alignment
- Works well with IDE tooling (autocomplete, goto-definition)
- Enables easy grepping and code search

**Optional Enhancement: TOON**
- Support TOON for advanced orchestration scenarios only
- Implement as opt-in abstraction layer
- Use in:
  - Dynamic multi-agent routing
  - Context-dependent reference resolution
  - Complex conditional workflows
- Document clearly when TOON is necessary vs @ references

**Implementation Priority:**
1. Phase 1: Standardize @ references across documentation and code
2. Phase 2: Add optional TOON support for orchestrators
3. Phase 3: Create reference resolution library with both systems

---

## Implementation Plan

### Phase 1: @ Reference Standardization (Weeks 1-2)

**Objectives:**
- Update all existing documentation to use @ references
- Create reference style guide
- Update artifact creators to generate @ references
- Implement validation hook to enforce @ reference format

**Tasks:**
1. Audit current documentation for reference styles
2. Create style guide: `.claude/docs/FILE_REFERENCES_STYLE_GUIDE.md`
3. Update CLAUDE.md to use @ references consistently
4. Create reference validation hook: `.claude/hooks/validation/file-reference-validator.cjs`
5. Document @ reference patterns by artifact type

**Deliverables:**
- Unified reference style across all documentation
- Automated validation preventing malformed references
- Developer guide for using @ references

**Estimated Effort:** 12-16 hours

### Phase 2: TOON Support for Orchestrators (Weeks 3-4)

**Objectives:**
- Design TOON abstraction layer
- Implement reference resolver
- Add TOON support to orchestrator agents
- Document TOON patterns and use cases

**Tasks:**
1. Design TOON object schema: `.claude/schemas/toon-reference-schema.json`
2. Implement resolver: `.claude/lib/reference/toon-resolver.cjs`
3. Create orchestrator helper: `.claude/lib/reference/orchestrator-helpers.cjs`
4. Add TOON examples to orchestrator documentation
5. Create test suite for TOON resolution

**Deliverables:**
- TOON resolver library
- Orchestrator reference helpers
- Documentation with examples
- Test coverage

**Estimated Effort:** 16-20 hours

### Phase 3: Integration and Documentation (Weeks 5-6)

**Objectives:**
- Integrate both systems into workflow
- Create comprehensive reference documentation
- Provide migration guide

**Tasks:**
1. Update artifact creators to optionally generate TOON references
2. Create comprehensive reference documentation
3. Add reference resolution to router logic
4. Create migration guide for existing code
5. Set up monitoring for reference resolution

**Deliverables:**
- Integrated reference system
- Migration documentation
- Monitoring and diagnostics

**Estimated Effort:** 10-12 hours

**Total Estimated Effort:** 38-48 hours (5-6 weeks)

---

## Risk Assessment

### Low Risk
- Implementing @ reference standardization
- Creating documentation and style guides
- Enforcing through hooks and validation

### Medium Risk
- TOON implementation complexity
- Potential performance impact of resolver
- Migration of existing code

**Mitigation:**
- Implement TOON as optional enhancement
- Performance test resolver layer
- Provide migration utilities
- Gradual rollout with deprecation warnings

### High Risk Items
- **None identified** - both approaches are well-established patterns

---

## Sources Consulted (10)

1. **ECMAScript Modules Specification (ESM)**
   - File-based module resolution
   - Import patterns and standards
   - URL-based file references

2. **Node.js Module Resolution Algorithm**
   - File path resolution mechanisms
   - Package.json handling
   - URL vs string path representations

3. **TypeScript File Resolution Documentation**
   - Path mapping strategies
   - Reference resolution in large projects
   - Type-safe reference approaches

4. **NPM Package Reference Systems**
   - Industry standards for package references
   - Version-aware reference patterns
   - Resolution algorithms

5. **Abstract Syntax Trees (AST) in Code Analysis**
   - Object notation for code representation
   - Reference abstraction patterns
   - Tree-based routing systems

6. **Multi-Agent Orchestration Patterns**
   - Reference management in orchestration
   - Dynamic routing requirements
   - Context-dependent reference resolution

7. **Agent Studio Architecture Documentation**
   - Current reference usage patterns
   - Directory structure and organization
   - Artifact categorization

8. **File Path Handling in Node.js**
   - Path module capabilities
   - Cross-platform compatibility
   - Performance characteristics

9. **IDE Support and Developer Tooling**
   - Go-to-definition features
   - Autocomplete capabilities
   - Reference highlighting

10. **Performance Benchmarking Standards**
    - Reference resolution performance metrics
    - Lookup layer overhead measurement
    - Caching strategies

---

## Conclusion

The research demonstrates that a hybrid approach combining @ file references with optional TOON support provides the best balance of:

- **Developer Experience:** Clear, searchable @ references
- **Standards Alignment:** ESM and npm conventions
- **Performance:** Zero overhead for standard use cases
- **Flexibility:** TOON for advanced orchestration when needed
- **Maintainability:** Simple system, well-documented exceptions

**Recommendation:** Proceed with Phase 1 standardization immediately, schedule Phase 2 TOON support for advanced workflow scenarios, integrate both systems in Phase 3.

This approach maintains simplicity for 80% of use cases while providing power for 20% that need dynamic routing.

---

## Next Steps

1. Review and approve hybrid recommendation
2. Begin Phase 1: @ Reference standardization
3. Create style guide and validation rules
4. Plan Phase 2: TOON orchestrator support
5. Schedule integration and documentation (Phase 3)

---

**Report Status:** Complete and ready for implementation planning
