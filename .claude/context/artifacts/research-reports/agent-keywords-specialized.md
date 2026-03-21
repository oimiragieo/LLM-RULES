# Agent Keywords Research Report: Specialized Agents

**Generated**: 2026-01-25
**Purpose**: Intent keywords for specialized agent routing
**Research Sources**: 7 web searches, agent definition files

---

## 1. C4 Model Agents (c4-code, c4-component, c4-container, c4-context)

### Research Summary

The C4 model is a hierarchical approach for visualizing software architecture with four levels of abstraction:
1. **System Context** - Highest level, stakeholder-focused
2. **Container** - Deployment units and runtime architecture
3. **Component** - Logical groupings within containers
4. **Code** - Lowest level, implementation details

**Source**: [C4 Model Official](https://c4model.com/diagrams)

### c4-code

**Primary Intent Keywords**:
- c4 code, code level, code diagram, code documentation
- function signatures, class diagram, code structure
- code analysis, code elements, code relationships

**Task Description Keywords**:
- document code, analyze code, code-level architecture
- function extraction, class analysis, module documentation
- dependency mapping, code organization, signature extraction

**Problem Indicators**:
- understand codebase, document functions, code structure unclear
- need code documentation, analyze source code

**Technology Keywords**:
- mermaid diagram, class diagram, flowchart
- language-agnostic, multi-language, code patterns

---

### c4-component

**Primary Intent Keywords**:
- c4 component, component level, component diagram
- component architecture, component documentation
- logical grouping, component boundaries

**Task Description Keywords**:
- component synthesis, interface definition, boundary identification
- group code into components, component relationships
- feature documentation, component design

**Problem Indicators**:
- organize code, define components, logical structure
- component boundaries unclear, need component diagram

**Technology Keywords**:
- mermaid C4Component, component diagram
- interface contracts, API definition

---

### c4-container

**Primary Intent Keywords**:
- c4 container, container level, container diagram
- deployment architecture, container documentation
- runtime containers, deployment units

**Task Description Keywords**:
- deployment mapping, container synthesis, API documentation
- OpenAPI, Swagger, container interfaces
- Docker, Kubernetes, infrastructure correlation

**Problem Indicators**:
- deployment architecture unclear, container relationships
- document APIs, deployment diagram needed

**Technology Keywords**:
- OpenAPI 3.1, Swagger, gRPC, REST
- Docker, Kubernetes, Helm, cloud services
- mermaid C4Container

---

### c4-context

**Primary Intent Keywords**:
- c4 context, system context, context diagram
- high-level architecture, system overview
- stakeholder view, user journeys

**Task Description Keywords**:
- persona identification, user journey mapping
- external dependencies, system features
- stakeholder documentation, big picture

**Problem Indicators**:
- system overview needed, explain to stakeholders
- user journeys unclear, external systems documentation

**Technology Keywords**:
- mermaid C4Context, persona mapping
- user journey, stakeholder diagram

---

## 2. code-reviewer

### Research Summary

Code review involves systematic examination of pull requests with focus on spec compliance, code quality, architecture, and best practices. Modern practices emphasize constructive feedback, automation of routine checks, and knowledge sharing.

**Sources**:
- [Qodo: Code Review Best Practices](https://www.qodo.ai/blog/code-review-best-practices/)
- [Codacy: Pull Request Best Practices](https://blog.codacy.com/pull-request-best-practices)
- [Swarmia: Complete Guide to Code Reviews](https://www.swarmia.com/blog/a-complete-guide-to-code-reviews/)

### Primary Intent Keywords
- code review, PR review, pull request review
- review code, review PR, review changes
- implementation review, code feedback

### Task Description Keywords
- spec compliance, code quality assessment
- architecture review, design review
- test coverage, security review
- merge approval, review feedback

### Problem Indicators
- review my PR, check my code, is this ready to merge
- code looks wrong, needs review, quality check
- implementation correct, follows standards

### Common Feedback Categories
- **Critical**: bugs, security issues, data loss risks
- **Important**: architecture problems, missing features, test gaps
- **Minor**: code style, optimization, documentation

---

## 3. conductor-validator

### Research Summary

Project validation for Context-Driven Development (CDD) setup. Validates Conductor project artifacts for completeness, consistency, and correctness. Based on spec-driven development principles where specifications are formalized before implementation.

**Sources**:
- [Thoughtworks: Spec-Driven Development 2025](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [Marvin Zhang: SDD Tools and Practices](https://www.marvinzhang.dev/blog/sdd-tools-practices)

### Primary Intent Keywords
- validate project, conductor validation
- context-driven development, CDD setup
- project context, artifact validation

### Task Description Keywords
- setup validation, content validation
- track validation, consistency validation
- verify artifacts, check project structure

### Problem Indicators
- context management not working, setup incomplete
- tracks not syncing, validation errors
- project context incomplete

### Validation Categories
- setup validation (directory structure, required files)
- content validation (required sections, markdown structure)
- track validation (status markers, plan tasks)
- consistency validation (cross-references, metadata)

---

## 4. database-architect

### Research Summary

Database architects design data systems, schemas, migrations, and optimize query performance. They work with both SQL and NoSQL databases, ensuring scalability, data integrity, and performance.

**Sources**:
- [Teal HQ: Database Architect Career Path](https://www.tealhq.com/career-paths/database-architect)
- [Indeed: Data Architect Job Description](https://www.indeed.com/hire/job-description/data-architect)
- [Coursera: What Does a Data Architect Do](https://www.coursera.org/articles/data-architect)

### Primary Intent Keywords
- database design, schema design, data model
- database architect, data architecture
- query optimization, migration planning

### Task Description Keywords
- create schema, design tables, normalize database
- optimize queries, improve performance
- plan migration, database changes
- ERD diagram, entity relationship

### Problem Indicators
- slow queries, database performance
- schema needs update, migration needed
- data model unclear, relationships wrong

### Technology Keywords
- PostgreSQL, MySQL, MongoDB, Redis
- SQL, NoSQL, ACID, normalization
- indexes, foreign keys, constraints
- AWS RDS, Aurora, Supabase, BigQuery
- Snowflake, Redshift, data warehouse
- ETL, ELT, dbt, Airflow

### Specialized Roles
- Cloud Database Architect (AWS/Azure/GCP)
- Data Warehouse Architect (star/snowflake schemas)
- NoSQL Database Architect (document/key-value/graph)

---

## 5. devops

### Research Summary

DevOps encompasses infrastructure as code, CI/CD pipelines, containerization, and observability. The field has evolved to include GitOps, policy-as-code, and AI-assisted automation.

**Sources**:
- [Octopus: Best CI/CD Tools for DevOps](https://octopus.com/devops/ci-cd/ci-cd-tools-for-devops/)
- [MantaIdeas: CI/CD Pipeline Guide 2025](https://mantraideas.com/cicd-pipeline-implementation-guide-2025/)
- [Spacelift: CI/CD Best Practices](https://spacelift.io/blog/ci-cd-best-practices)

### Primary Intent Keywords
- devops, infrastructure, CI/CD
- deployment, pipeline, automation
- containerization, kubernetes, docker

### Task Description Keywords
- create pipeline, setup CI/CD
- infrastructure as code, IaC
- deploy application, configure deployment
- monitoring setup, observability

### Problem Indicators
- deployment failing, pipeline broken
- need automation, manual deployment
- infrastructure setup, cloud configuration

### Technology Keywords
- GitHub Actions, GitLab CI, Jenkins
- Terraform, Pulumi, CloudFormation
- Docker, Kubernetes, Helm
- Prometheus, Grafana, DataDog
- AWS, Azure, GCP
- ArgoCD, Flux, GitOps

---

## 6. devops-troubleshooter

### Research Summary

Specialized debugging for production issues, system reliability, and incident investigation. Masters observability tools, distributed system debugging, and root cause analysis.

**Sources**:
- [Google SRE: Incident Response](https://sre.google/workbook/incident-response/)
- [Rootly: Incident Response Runbook 2025](https://rootly.com/blog/incident-response-runbook-template-2025-step-by-step-guide-real-world-examples)

### Primary Intent Keywords
- debug, troubleshoot, investigate
- system issue, performance problem
- production problem, incident debug

### Task Description Keywords
- analyze logs, trace requests
- root cause analysis, RCA
- performance debugging, resource analysis
- Kubernetes debugging, container issues

### Problem Indicators
- system slow, high memory, CPU spike
- pods crashing, OOMKilled, restarts
- connection timeout, network issues
- deployment failed, rollback needed

### Technology Keywords
- ELK Stack, Loki, Fluentd
- Prometheus, Grafana, DataDog
- Jaeger, Zipkin, OpenTelemetry
- kubectl, Docker, containerd
- tcpdump, Wireshark, eBPF

---

## 7. incident-responder

### Research Summary

SRE incident response following modern practices: incident command structure, severity classification, blameless postmortems, and continuous improvement. Focuses on rapid service restoration and learning from incidents.

**Sources**:
- [Google SRE: On-Call Best Practices](https://sre.google/workbook/on-call/)
- [Rootly: SRE Incident Management 2025](https://rootly.com/sre/2025-sre-incident-management-best-practices-checklist)
- [Incident.io: SRE Terminology Guide](https://incident.io/blog/the-complete-sre-terminology-guide-every-term-engineers-actually-need-to-know)

### Primary Intent Keywords
- incident, outage, production down
- SRE, site reliability, on-call
- service degraded, system down

### Task Description Keywords
- incident response, war room
- severity assessment, impact analysis
- postmortem, root cause analysis
- escalation, communication strategy

### Problem Indicators
- production outage, service unavailable
- customers affected, SLA violation
- urgent issue, P0/P1/SEV1
- system not responding

### Severity Keywords
- P0/SEV-1: critical, complete outage, security breach
- P1/SEV-2: high, major degradation, significant impact
- P2/SEV-3: medium, minor functionality affected
- P3/SEV-4: low, cosmetic, no user impact

### Technology Keywords
- PagerDuty, Opsgenie, ServiceNow
- Slack, status page, incident timeline
- MTTR, MTTD, error budget, SLO/SLI

---

## 8. reverse-engineer

### Research Summary

Binary analysis, disassembly, and decompilation for security research, CTF challenges, and authorized software analysis. Uses modern tools including AI-assisted decompilation.

**Sources**:
- [GitHub: LLM4Decompile](https://github.com/albertan017/LLM4Decompile)
- [scmGalaxy: Top 10 Reverse Engineering Tools 2025](https://www.scmgalaxy.com/tutorials/top-10-reverse-engineering-tools-in-2025-features-pros-cons-comparison/)
- [LetsDefend: Top 7 Reverse Engineering Tools](https://letsdefend.io/blog/top-7-reverse-engineering-tools)

### Primary Intent Keywords
- reverse engineer, binary analysis, disassembly
- decompile, malware analysis, CTF
- security research, vulnerability research

### Task Description Keywords
- analyze binary, disassemble executable
- decompile code, extract strings
- identify vulnerability, exploit analysis
- protocol extraction, firmware analysis

### Problem Indicators
- understand binary, analyze malware
- CTF challenge, crack password
- undocumented software, closed source

### Technology Keywords
- IDA Pro, Ghidra, Binary Ninja, radare2
- x64dbg, WinDbg, GDB, LLDB
- Frida, DynamoRIO, Unicorn Engine
- PE, ELF, Mach-O, DEX
- x86, ARM, MIPS, RISC-V
- capstone, keystone, angr, pwntools

### Analysis Types
- Static analysis (disassembly, decompilation)
- Dynamic analysis (debugging, tracing)
- Hybrid analysis (combination)

---

## 9. security-architect

### Research Summary

Security architecture design, threat modeling, and compliance validation. Uses STRIDE, OWASP Top 10, and zero-trust principles. Specializes in authentication, authorization, and encryption.

**Sources**:
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [GitLab: OWASP Top 10 2025 Changes](https://about.gitlab.com/blog/2025-owasp-top-10-whats-changed-and-why-it-matters/)
- [Airbus: Threat Modelling for Security Architects](https://www.protect.airbus.com/blog/security-architecture-part-2/)

### Primary Intent Keywords
- security, security review, security architecture
- threat model, vulnerability, compliance
- authentication, authorization, encryption

### Task Description Keywords
- security assessment, threat modeling
- STRIDE analysis, attack surface
- compliance validation, SOC2, HIPAA, GDPR
- security code review, penetration testing

### Problem Indicators
- security concern, vulnerability found
- authentication issue, authorization problem
- compliance requirement, audit preparation
- data protection, encryption needed

### Framework Keywords
- OWASP Top 10, STRIDE, MITRE ATT&CK
- Zero Trust, defense-in-depth
- least privilege, need-to-know
- SAMM, DSOMM, ASVS

### OWASP Top 10:2025 Categories
1. Broken Access Control
2. Cryptographic Failures
3. Software Supply Chain Failures (NEW)
4. Injection
5. Insecure Design
6. Security Misconfiguration
7. Vulnerable and Outdated Components
8. Identification and Authentication Failures
9. Software and Data Integrity Failures
10. Mishandling of Exceptional Conditions (NEW)

### Compliance Keywords
- SOC2, HIPAA, GDPR, PCI-DSS
- ISO 27001, NIST CSF, IEC 62443
- Cyber Essentials, FedRAMP

---

## Summary: Keyword Categories

### By Agent Type

| Agent | Primary Trigger Keywords |
|-------|-------------------------|
| c4-code | code level, function signatures, code diagram |
| c4-component | component level, logical grouping, boundaries |
| c4-container | container level, deployment, OpenAPI |
| c4-context | system context, stakeholder, personas |
| code-reviewer | review code, PR review, merge approval |
| conductor-validator | validate project, CDD, context validation |
| database-architect | schema, database, migration, query |
| devops | CI/CD, infrastructure, deployment, pipeline |
| devops-troubleshooter | debug, troubleshoot, investigate, logs |
| incident-responder | incident, outage, SRE, production down |
| reverse-engineer | binary, disassemble, decompile, malware |
| security-architect | security, threat model, compliance, vulnerability |

### Urgency Indicators

**High Urgency (Immediate Response)**:
- incident-responder: "outage", "production down", "P0", "SEV-1"
- devops-troubleshooter: "system down", "critical error", "urgent"
- security-architect: "security breach", "vulnerability", "data leak"

**Medium Urgency (Same Day)**:
- code-reviewer: "review PR", "ready to merge"
- devops: "deployment needed", "pipeline broken"
- database-architect: "migration required"

**Standard Priority**:
- c4-* agents: documentation and architecture
- conductor-validator: validation tasks
- reverse-engineer: analysis requests

---

## Research Methodology

1. **Web Searches Executed**: 7 queries across C4 model, code review, database architecture, DevOps, SRE, reverse engineering, and security architecture
2. **Agent Files Analyzed**: 12 specialized agent definitions from `.claude/agents/specialized/`
3. **External Sources Consulted**: OWASP, Google SRE, C4 Model official site, industry blogs

## References

- [C4 Model Official](https://c4model.com/)
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [Google SRE Workbook](https://sre.google/workbook/)
- [Qodo Code Review Best Practices](https://www.qodo.ai/blog/code-review-best-practices/)
- [Rootly Incident Response Guide](https://rootly.com/incident-response/runbooks)
- [scmGalaxy RE Tools 2025](https://www.scmgalaxy.com/tutorials/top-10-reverse-engineering-tools-in-2025-features-pros-cons-comparison/)
