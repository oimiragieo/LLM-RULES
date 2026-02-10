# Memory Forensics Rules

## Core Principles

- Memory captures preserve volatile evidence (running processes, network connections, decryption keys)
- Volatility framework is industry standard for memory analysis
- Chain of custody matters - document all analysis steps
- Focus on artifacts: processes, network, registry, files, malware
- Memory dumps expire - analyze immediately after acquisition

## When to Use

Use memory-forensics when:

- Analyzing memory dumps from incident response
- Investigating malware in RAM captures
- Extracting volatile evidence (running processes, network connections)
- Performing post-exploitation forensics
- Recovering encryption keys or credentials from memory

## Standards

### Memory Acquisition

**Tools for Acquisition**:

- **Windows**: WinPmem, DumpIt, FTK Imager, Magnet RAM Capture
- **Linux**: avml, LiME (Linux Memory Extractor)
- **macOS**: OSXPmem
- **Volatility**: Memory acquisition plugins

**Acquisition Commands**:

```bash
# Windows (WinPmem)
winpmem_mini_x64.exe memdump.raw

# Linux (avml)
./avml memory.lime

# Verify acquisition
sha256sum memory.raw > memory.raw.sha256
```

### Memory Analysis Workflow

**Step 1: Profile Identification**

```bash
# Identify OS profile
volatility -f memory.raw imageinfo

# For Volatility 3
vol -f memory.raw windows.info
```

**Step 2: Process Analysis**

```bash
# List running processes
volatility -f memory.raw --profile=Win10x64 pslist
volatility -f memory.raw --profile=Win10x64 pstree
volatility -f memory.raw --profile=Win10x64 psscan

# Find hidden processes
volatility -f memory.raw --profile=Win10x64 psxview

# Dump specific process
volatility -f memory.raw --profile=Win10x64 procdump -p <PID> -D output/
```

**Step 3: Network Artifacts**

```bash
# Network connections
volatility -f memory.raw --profile=Win10x64 netscan
volatility -f memory.raw --profile=Win10x64 connscan

# Extract network packets from memory
volatility -f memory.raw --profile=Win10x64 netscan --output=json
```

**Step 4: Malware Detection**

```bash
# Detect code injection
volatility -f memory.raw --profile=Win10x64 malfind

# List loaded DLLs
volatility -f memory.raw --profile=Win10x64 dlllist -p <PID>

# Check for hooks
volatility -f memory.raw --profile=Win10x64 ssdt
volatility -f memory.raw --profile=Win10x64 idt
```

**Step 5: Registry Hives**

```bash
# List registry hives in memory
volatility -f memory.raw --profile=Win10x64 hivelist

# Dump registry hive
volatility -f memory.raw --profile=Win10x64 hivedump -o <offset>

# Print specific registry key
volatility -f memory.raw --profile=Win10x64 printkey -K "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
```

**Step 6: File Extraction**

```bash
# List open files
volatility -f memory.raw --profile=Win10x64 filescan

# Dump file from memory
volatility -f memory.raw --profile=Win10x64 dumpfiles -Q <offset> -D output/

# Extract user files
volatility -f memory.raw --profile=Win10x64 filescan | grep -i ".doc\|.pdf\|.exe"
```

**Step 7: Credential Extraction**

```bash
# Extract password hashes
volatility -f memory.raw --profile=Win10x64 hashdump

# Extract cached credentials
volatility -f memory.raw --profile=Win10x64 cachedump

# Extract LSA secrets
volatility -f memory.raw --profile=Win10x64 lsadump
```

## Anti-Patterns

| Pattern                     | Problem                | Fix                                                |
| --------------------------- | ---------------------- | -------------------------------------------------- |
| No acquisition verification | Corrupted dump         | Always hash and verify                             |
| Wrong profile               | Failed analysis        | Use imageinfo first                                |
| Single tool reliance        | Missed artifacts       | Use multiple tools (Volatility, Rekall, MemProcFS) |
| No timeline                 | Lost context           | Create timeline with timeliner                     |
| Analyzing on live system    | Evidence contamination | Work on forensic copy                              |
| No documentation            | Lost chain of custody  | Document every step                                |

## Tool Integration

### Volatility 3 (Modern)

```bash
# List available plugins
vol --help

# Windows analysis
vol -f memory.raw windows.pslist
vol -f memory.raw windows.netscan
vol -f memory.raw windows.malfind

# Linux analysis
vol -f memory.lime linux.pslist
vol -f memory.lime linux.bash

# macOS analysis
vol -f memory.raw mac.pslist
```

### MemProcFS (Alternative)

```bash
# Mount memory as filesystem
memprocfs -device memory.raw -forensic 1

# Browse as files
cd /mnt/memory/name/
ls -la
```

### Rekall (Alternative)

```bash
# Profile autodetection
rekall -f memory.raw

# Run plugins
rekall -f memory.raw pslist
rekall -f memory.raw netstat
```

## Analysis Artifacts

### Process Artifacts

| Artifact         | Command            | Purpose                   |
| ---------------- | ------------------ | ------------------------- |
| Process list     | `pslist`, `pstree` | Running processes         |
| Hidden processes | `psxview`          | Rootkit detection         |
| Process memory   | `memdump`          | Extract process memory    |
| Loaded DLLs      | `dlllist`          | Identify injected DLLs    |
| Process handles  | `handles`          | Open files, registry keys |

### Network Artifacts

| Artifact           | Command              | Purpose                  |
| ------------------ | -------------------- | ------------------------ |
| Active connections | `netscan`            | Current network activity |
| Connection history | `connscan`           | Terminated connections   |
| DNS cache          | `dns_cache` (plugin) | Resolve domain queries   |

### Malware Artifacts

| Artifact       | Command       | Purpose                |
| -------------- | ------------- | ---------------------- |
| Code injection | `malfind`     | Detect injected code   |
| Rootkit hooks  | `ssdt`, `idt` | Detect kernel hooks    |
| Driver list    | `driverscan`  | Find malicious drivers |
| Mutexes        | `mutantscan`  | Malware indicators     |

## Integration Points

**Related Skills**:

- `binary-analysis-patterns` - Analyze extracted executables
- `protocol-reverse-engineering` - Analyze network artifacts
- `variant-analysis` - Find similar malware patterns

**Related Agents**:

- `security-architect` - Threat modeling from findings
- `penetration-tester` - Post-exploitation analysis
- `incident-responder` - Incident investigation

**Related Workflows**:

- Incident response - Memory analysis phase
- Malware analysis - Dynamic analysis from memory
- Threat hunting - Memory-based IOC detection

## Best Practices

1. **Acquire immediately**: Memory is volatile
2. **Hash everything**: Maintain chain of custody
3. **Use correct profile**: Wrong profile = failed analysis
4. **Multiple tools**: Cross-validate findings
5. **Timeline creation**: Establish sequence of events
6. **Document findings**: Screenshots, commands, outputs
7. **Preserve original**: Never modify original dump
8. **Look for persistence**: Registry run keys, services, scheduled tasks

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
