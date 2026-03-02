# yara-authoring Rules

## Purpose

YARA-X detection rule authoring with expert judgment, linting, atom analysis, and best practices. Teaches how to think like an expert YARA author for malware detection, threat hunting, and indicator-of-compromise identification using YARA-X (the Rust-based successor to legacy YARA).

## Best Practices

- Write rules targeting YARA-X syntax and features by default
- Always include metadata fields (author, date, description, reference, hash)
- Use atom analysis to verify rules have efficient matching atoms
- Lint rules before deployment to catch common errors
- Prefer specific byte patterns over broad wildcards to reduce false positives

## Integration Points

See SKILL.md for complete documentation.
