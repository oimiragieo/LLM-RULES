# Research Report: ai-ml-specialist Agent

**Generated**: 2026-01-25
**EVOLVE Phase**: OBTAIN (Research)
**Artifact Type**: Agent
**Artifact Name**: ai-ml-specialist

## Executive Summary

This research report documents the research conducted before creating the `ai-ml-specialist` agent. The agent fills a gap in the ecosystem for dedicated AI/ML expertise, distinct from the general `python-pro` agent and the thin `ai-ml-expert` skill.

## Research Queries Executed

### Query 1: AI/ML Agent Best Practices
**Query**: "AI ML agent best practices model development workflow 2025 2026"
**Sources Consulted**:
- AWS: Agentic AI design patterns and best practices
- Google Cloud: ML workflow orchestration
- Anthropic: Claude agent design patterns

**Key Findings**:
- Agentic workflows require structured reasoning and tool orchestration
- Multi-step planning essential for complex ML tasks
- Experiment tracking is foundational to reproducibility

### Query 2: MLOps Best Practices
**Query**: "MLOps best practices model deployment experiment tracking 2025"
**Sources Consulted**:
- MLflow documentation and community patterns
- Weights & Biases best practices guide
- Google ML Engineering best practices

**Key Findings**:
- MLflow is the de facto standard for experiment tracking
- Model registries essential for production workflows
- CI/CD for ML requires specialized pipelines
- Drift detection and monitoring critical for production

### Query 3: Code Context - ML Frameworks
**Query**: Exa code context search for PyTorch, TensorFlow, MLflow patterns
**Sources Consulted**:
- PyTorch Lightning documentation
- Hugging Face Transformers patterns
- BentoML serving patterns

**Key Findings**:
- PyTorch Lightning provides structured training loops
- Hugging Face Transformers standardizes NLP workflows
- BentoML simplifies model serving with async support
- Type hints and testing essential for production code

## Existing Codebase Analysis

### Analyzed Artifacts

1. **python-pro.md** (`.claude/agents/domain/python-pro.md`)
   - Comprehensive Python agent with ML capabilities mentioned
   - Uses opus model, lazy_load context strategy
   - Has "Data Science & Machine Learning" capability section
   - **Gap**: General Python focus, not ML-specialized

2. **data-engineer.md** (`.claude/agents/domain/data-engineer.md`)
   - Data engineering agent with ETL/pipeline focus
   - Skills: data-expert, text-to-sql, diagram-generator
   - Covers Airflow, dbt, data quality
   - **Gap**: Data pipelines focus, not model development

3. **ai-ml-expert skill** (`.claude/skills/ai-ml-expert/SKILL.md`)
   - Thin skill with basic guidelines
   - Not a comprehensive agent
   - **Gap**: Needs agent to invoke and orchestrate

4. **scientific-skills** (`.claude/skills/scientific-skills/SKILL.md`)
   - 139 specialized skills for scientific computing
   - Includes pytorch-lightning, scikit-learn, transformers
   - **Opportunity**: Should be leveraged by ai-ml-specialist

### Gap Analysis

| Capability | python-pro | data-engineer | ai-ml-specialist |
|------------|------------|---------------|------------------|
| PyTorch training | Partial | No | **Full** |
| Experiment tracking | No | No | **Full** |
| Model serving | No | No | **Full** |
| MLOps pipelines | No | Partial | **Full** |
| Fine-tuning LLMs | No | No | **Full** |
| Model optimization | No | No | **Full** |

## Design Decisions

### 1. Model Selection: opus
**Rationale**: ML tasks require complex reasoning about architectures, hyperparameters, and deployment strategies. Extended thinking enabled for thorough analysis.

### 2. Skills: ai-ml-expert + python-backend-expert + data-expert + scientific-skills
**Rationale**: Combines ML expertise with Python patterns, data handling, and specialized scientific computing sub-skills.

### 3. Extended Thinking: Enabled
**Rationale**: ML architecture decisions and debugging require deep analysis.

### 4. Temperature: 0.3
**Rationale**: Low temperature for deterministic, reproducible code generation.

### 5. Context Strategy: lazy_load
**Rationale**: ML tasks may require reading multiple files; lazy loading optimizes context usage.

## Best Practices Incorporated

From research, the following best practices were incorporated into the agent:

1. **Experiment Tracking First**: MLflow/W&B integration from day one
2. **Reproducibility**: Seed control, deterministic operations, version control
3. **Structured Training**: PyTorch Lightning patterns for maintainability
4. **Model Cards**: Documentation of model limitations and intended use
5. **CI/CD for ML**: Automated testing and deployment pipelines
6. **Drift Detection**: Production monitoring for model degradation
7. **Optimization Awareness**: ONNX, TensorRT, quantization patterns

## Validation

### Schema Compliance
- [x] name: lowercase-with-hyphens
- [x] description: 20-500 chars, includes "Use for"
- [x] tools: valid array
- [x] model: valid enum (opus)
- [x] temperature: 0-1 range
- [x] priority: valid enum (high)
- [x] skills: valid array
- [x] context_strategy: valid enum (lazy_load)

### Content Completeness
- [x] Core Persona (4 fields)
- [x] Responsibilities (6 items)
- [x] Capabilities section
- [x] Tools & Frameworks section
- [x] Workflow with Step 0 (Load Skills)
- [x] Memory Protocol (MANDATORY)
- [x] Task Synchronization Protocol
- [x] Verification Protocol

### Task Tool Integration
- [x] TaskUpdate in tools array
- [x] TaskList in tools array
- [x] TaskCreate in tools array
- [x] TaskGet in tools array
- [x] task-management-protocol in skills array

## Conclusion

The ai-ml-specialist agent fills a clear gap in the ecosystem for dedicated ML expertise. It leverages existing skills (ai-ml-expert, python-backend-expert, data-expert, scientific-skills) while providing comprehensive guidance for model development, MLOps, and production deployment.

## References

1. AWS Prescriptive Guidance: Agentic AI Design Patterns
2. Google Cloud ML Best Practices
3. MLflow Documentation
4. Weights & Biases Best Practices
5. PyTorch Lightning Documentation
6. Hugging Face Transformers Documentation
7. BentoML Model Serving Guide
8. Kubeflow Pipelines Documentation
