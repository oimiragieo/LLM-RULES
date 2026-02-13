---
paths:
  - .claude/skills/ai-ml-expert/**
---

# AI/ML Expert Rules

## Core Principles

- PyTorch for deep learning and modern neural architectures
- LangChain for LLM integration and prompt chains
- Proper model evaluation and validation (not just accuracy)
- Data quality and preprocessing as foundation
- Fine-tuning and transfer learning over training from scratch

## Input Requirements

- Model architecture and training objectives
- Dataset specifications (size, distribution, quality)
- Hyperparameter configuration and tuning strategy
- Evaluation metrics aligned with business goals
- Infrastructure constraints (GPU, memory, latency)

## Output Standards

### Required ML Rule Elements

1. **Model Architecture**: Clear design choices with justification
2. **Training Strategy**: Data splits, loss functions, optimization approach
3. **Validation Approach**: Cross-validation, test set methodology
4. **Evaluation Metrics**: Precision, recall, F1, or domain-specific metrics
5. **Performance Benchmarks**: Expected vs achieved results
6. **Deployment Readiness**: Model serialization, inference optimization

## Implementation Patterns

### Training Loop Standards

- Proper train/validation/test splits (80/10/10 or stratified)
- Gradient accumulation for larger effective batch sizes
- Learning rate scheduling (warmup, decay, plateau)
- Early stopping based on validation metrics
- Checkpointing and recovery

### Fine-Tuning Standards

- Transfer learning from pre-trained models (BERT, GPT, ResNet)
- Layer freezing strategy (freeze early layers, fine-tune later)
- Learning rate reduction for transfer learning (10-100x smaller)
- Adapter modules for parameter-efficient fine-tuning
- Domain-specific vocabulary and tokenization

### LLM Integration Patterns

- Prompt engineering with few-shot examples
- Chaining prompts for multi-step reasoning
- Temperature and top-k sampling tuning
- Token budget management and compression
- Semantic caching for repeated prompts

## Anti-Patterns

| Anti-Pattern                 | Problem                        | Fix                                           |
| ---------------------------- | ------------------------------ | --------------------------------------------- |
| Ignoring class imbalance     | Model biased to majority class | Use stratified sampling, weighted loss        |
| No validation set            | Overfitting undetected         | Hold out 10-20% for validation                |
| Optimizing single metric     | Missing failure modes          | Use multiple metrics (precision, recall, F1)  |
| No baseline                  | Can't assess model quality     | Establish simple baseline (heuristic, random) |
| Using accuracy alone         | Misleading for imbalanced data | Use F1, precision-recall, ROC-AUC             |
| Data leakage (test in train) | Inflated performance estimates | Rigorous split: test never seen during train  |
| No error analysis            | Can't improve strategically    | Analyze failure cases by error type           |
| Premature optimization       | Wasting resources              | Profile first, optimize hot paths             |

## Integration Points

### Agents Using This Rule

- **developer**: Implements ML models, data pipelines
- **researcher**: Investigates novel architectures, papers
- **architect**: Designs ML system architecture
- **security-architect**: Reviews data privacy, model security

### Related Skills

- **python-backend-expert**: NumPy, Pandas, Scikit-learn
- **performance-engineer**: GPU optimization, inference serving
- **data-expert**: Data validation, preprocessing, quality
- **testing**: ML-specific test strategies

### Workflows

- **feature-development-workflow.md**: ML feature development phase
- **enterprise-workflow.md**: Production ML deployment gates
- **research-synthesis**: Prior art investigation for new models

## Best Practices

- **Reproducibility**: Fix random seeds, log hyperparameters
- **Data Documentation**: Dataset descriptions, bias analysis
- **Model Cards**: Document intended use, limitations, biases
- **Version Control**: Track data, models, hyperparameters
- **Monitoring**: Track drift in production, retraining triggers

## Related References

- `.claude/skills/ai-ml-expert/SKILL.md` - Complete AI/ML skill specification
- `.claude/skills/python-backend-expert/SKILL.md` - Python data science patterns
- `.claude/rules/testing.md` - ML testing strategies
