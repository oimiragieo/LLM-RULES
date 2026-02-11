---
paths:
  - .claude/skills/binary-analysis-patterns/**
---

# Binary Analysis Patterns Rules

## Core Principles

- Static analysis first: disassemble before running
- Understand calling conventions and architecture-specific patterns
- Control flow graphs reveal business logic and vulnerabilities
- Symbol information (when available) accelerates analysis
- Never trust the binary—validate assumptions empirically

## Input Requirements

- Binary file (executable, library, firmware)
- Target architecture (x86, x64, ARM, MIPS)
- Operating system or platform context
- Analysis objectives (vulnerability hunting, reverse engineering, malware analysis)
- Available tools (IDA Pro, Ghidra, Radare2)

## Output Standards

### Required Analysis Elements

1. **Function Identification**: Entry points, imported/exported functions
2. **Control Flow Graphs**: Decision points, loops, function calls
3. **Data Flow Analysis**: Input/output parameters, global data usage
4. **Vulnerability Report**: Findings with severity and remediation
5. **Pattern Recognition**: Common attack patterns (ROP, shellcode, packing)
6. **Mitigation Recommendations**: Specific fixes or detection methods

## Analysis Techniques

### Disassembly Fundamentals

- **IDA Pro**: Industry standard for interactive disassembly
  - Navigation: xref (cross-references), define functions, rename symbols
  - Graphs: Flow analysis, dependency charts
  - Scripting: IDAPython for automation

- **Ghidra**: Open-source alternative with decompilation
  - Control flow graphs with loop detection
  - Collaborative features for large teams
  - Plugin development

- **Radare2**: Lightweight, scriptable analysis
  - Framework for custom analysis tools
  - Debugging integration

### Decompilation Strategies

- Start with high-level decompiler output (Ghidra, Hex-Rays)
- Identify function signatures and calling conventions
- Cross-reference with assembly for accuracy
- Annotate types and function names for clarity
- Validate decompiler output against dynamic behavior

### Control Flow Analysis

- **Identify Loops**: Count iterations, find loop-exiting conditions
- **Detect Branches**: Conditional jumps, switch tables, virtual calls
- **Trace Execution**: Follow value propagation from input to output
- **Find Cycles**: Mutual recursion, state machines

## Common Patterns

### Vulnerability Patterns

**Buffer Overflow**:

- Unbounded string operations (strcpy, gets, sprintf)
- Stack-based array manipulation without bounds checking
- Write to fixed-offset stack locations

**Integer Overflow**:

- Addition/multiplication without overflow checks
- Signed-to-unsigned conversion issues
- Loop counters used as size calculations

**Use-After-Free**:

- Pointer dereference after free()
- Reference counting errors
- Dangling pointers from stack-allocated data

### Protection Mechanisms

**Stack Canaries**:

- Verification before return: `cmp [rbp-8], gs:28h`

**ASLR (Address Space Layout Randomization)**:

- PIE (Position Independent Executable) flag
- RIP-relative addressing for position independence

**DEP/NX (Data Execution Prevention)**:

- Read-only code sections
- ROP gadgets as workaround

### Obfuscation Patterns

**Code Packing**:

- UPX headers and unpacking stubs
- Custom packers with polymorphic decryption
- Stub detection: entropy analysis, import table checks

**String Encryption**:

- XOR decryption routines
- RC4, AES decryption with embedded keys
- Deobfuscation: patch decryption, execute and dump

## Anti-Patterns

| Anti-Pattern                    | Problem                              | Fix                                           |
| ------------------------------- | ------------------------------------ | --------------------------------------------- |
| Skipping function signatures    | Misunderstanding parameters/returns  | Use calling convention docs, validate types   |
| Assuming sequential logic       | Missing indirect calls/jumps         | Check xrefs, jmp tables, virtual calls        |
| Ignoring compiler optimizations | Misinterpreting dead code            | Understand -O2/-O3 patterns (tail calls, etc) |
| Manual decompilation only       | Time-consuming, error-prone          | Use decompiler, then verify against asm       |
| No architecture consideration   | x86 ≠ ARM ≠ MIPS calling conventions | Document target arch at start                 |
| Missing context (libc, stdlib)  | Can't identify library functions     | Analyze with symbols first if available       |

## Integration Points

### Agents Using This Rule

- **security-architect**: Vulnerability identification and risk assessment
- **penetration-tester**: Gadget finding for ROP chains, exploit development
- **developer**: Understanding third-party library behavior
- **researcher**: Malware analysis and reverse engineering

### Related Skills

- **variant-analysis**: Finding vulnerability patterns across binaries
- **static-analysis**: CodeQL/Semgrep for source code complement
- **protocol-reverse-engineering**: Understanding network protocols in binaries

### Workflows

- **security-review-workflow.md**: Binary analysis phase for closed-source components
- **enterprise-workflow.md**: Third-party library security assessment

## Best Practices

- **Symbol Stripping**: Assume stripped binaries; use heuristics for function detection
- **Type Inference**: Propagate types from known functions (strcpy expects char\*)
- **Validation**: Cross-reference disassembly with dynamic analysis
- **Documentation**: Annotate discovered functions and data structures
- **Version Tracking**: Binaries change with updates; track diffs

## Related References

- `.claude/skills/binary-analysis-patterns/SKILL.md` - Complete binary analysis skill
- `.claude/skills/static-analysis/SKILL.md` - Source code analysis complement
- `.claude/rules/security-architect.md` - Vulnerability assessment framework
