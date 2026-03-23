# YARA Rule Authoring

Write YARA-X detection rules for malware, threat hunting, and IOC identification.

## Rule Quality Gates

- Every rule MUST have at least one string with a strong atom (4+ unique bytes)
- Avoid single-byte atoms, common strings ("http", "GET"), and high-entropy wildcards
- Test with `yara-x scan` before publishing
- Lint with `yara-x check` — zero warnings required

## Structure

```yara
rule RuleName {
    meta:
        description = "What this detects"
        author = "agent-studio"
        date = "YYYY-MM-DD"
    strings:
        $s1 = { 4D 5A 90 00 }  // prefer hex for binary
        $s2 = "specific_api_call" nocase
    condition:
        uint16(0) == 0x5A4D and $s1 and $s2
}
```

## Anti-Patterns

- Never use `$s = "a"` — too broad
- Never use `any of them` with weak strings
- Always scope with file header checks when possible

## When to invoke

`Skill({ skill: 'yara-authoring' })` — for all YARA rule creation or review
