# Scientific Skills Rules

## Core Principles

- 139 specialized skills for scientific research across biology, chemistry, medicine, and data science
- Database-first approach: Query databases before analysis
- Workflow chaining: Literature review → Hypothesis → Experiment design
- Reproducible research: Document all analysis steps
- Publication-ready output: Scientific writing and figure generation built-in

## When to Use

Use scientific-skills when:
- Working on scientific research tasks
- Need access to specialized databases (PubMed, ChEMBL, UniProt, PDB)
- Performing bioinformatics or cheminformatics analysis
- Creating literature reviews or scientific documents
- Analyzing single-cell RNA-seq, proteomics, or multi-omics data
- Drug discovery and molecular analysis workflows
- Statistical analysis and machine learning on scientific data

## Standards

### Skill Categories

**Scientific Databases (28+ skills)**:
- PubChem, ChEMBL, UniProt, PDB, DrugBank (compound/protein databases)
- KEGG, Reactome, String (pathway and interaction databases)
- ClinVar, COSMIC, GWAS (clinical and genomic databases)
- AlphaFold (protein structure predictions)
- BioRxiv, ClinicalTrials.gov (preprints and trials)

**Python Analysis Libraries (55+ skills)**:
- RDKit (cheminformatics), Scanpy (single-cell), BioPython (computational biology)
- PyTorch Lightning, scikit-learn, transformers (machine learning)
- DeepChem, ESM, Datamol (chemistry and protein ML)
- Pandas, Polars, Vaex (data manipulation)
- Matplotlib, Seaborn, Plotly (visualization)

**Workflows**:
- `literature-review` - 7-phase systematic reviews with PRISMA flow
- `hypothesis-generation` - 8-step hypothesis development
- `drug-discovery` - RDKit + ChEMBL molecular screening
- `single-cell-analysis` - Scanpy pipeline from QC to annotation
- `scientific-writing` - Academic writing assistance
- `scientific-schematics` - AI-generated publication figures

### Invocation Patterns

**Main catalog**:
```javascript
Skill({ skill: 'scientific-skills' }); // Load full catalog
```

**Specific sub-skills**:
```javascript
Skill({ skill: 'scientific-skills/rdkit' }); // Cheminformatics
Skill({ skill: 'scientific-skills/scanpy' }); // Single-cell analysis
Skill({ skill: 'scientific-skills/biopython' }); // Bioinformatics
Skill({ skill: 'scientific-skills/literature-review' }); // Literature review
```

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Skip database queries | Analyzing without context | Query databases first (PubMed, ChEMBL) |
| Manual workflows | Inefficient, error-prone | Use built-in workflows |
| Poor documentation | Irreproducible research | Document all analysis steps |
| No visualization | Hard to interpret results | Use plotting skills |
| Ignore literature | Reinvent solutions | Use literature-review skill first |
| Single-tool analysis | Incomplete picture | Chain multiple skills |

## Common Workflows

### Literature Review Workflow

```javascript
// 7-phase systematic review
Skill({ skill: 'scientific-skills/literature-review' });
// 1. Planning with PICO framework
// 2. Multi-database search (PubMed, Google Scholar, BioRxiv)
// 3. Screening with PRISMA flow diagram
// 4. Data extraction and quality assessment
// 5. Thematic synthesis
// 6. Citation verification
// 7. PDF generation with figures
```

### Drug Discovery Workflow

```javascript
// Molecular screening pipeline
Skill({ skill: 'scientific-skills/rdkit' });
Skill({ skill: 'scientific-skills/chembl-database' });
// 1. Query ChEMBL for bioactivity data
// 2. Calculate molecular descriptors
// 3. Filter by drug-likeness (Lipinski's Rule of 5)
// 4. Similarity screening
// 5. Substructure analysis
```

### Single-Cell Analysis Workflow

```javascript
// RNA-seq analysis pipeline
Skill({ skill: 'scientific-skills/scanpy' });
// 1. Load and QC data
// 2. Normalization and feature selection
// 3. Dimensionality reduction (PCA, UMAP)
// 4. Clustering (Leiden algorithm)
// 5. Marker gene identification
// 6. Cell type annotation
```

## Integration Points

**Related Agents**:
- `data-engineer` - Works with polars, dask, vaex, zarr-python
- `python-pro` - Uses all Python-based scientific skills
- `database-architect` - Database skills for schema design
- `technical-writer` - Uses literature-review, scientific-writing

**Related Skills**:
- `data-expert` - Data manipulation and transformation
- `machine-learning` - Statistical analysis integration
- `visualization` - Publication-quality figures

**Related Workflows**:
- Research workflow - Literature review → Hypothesis → Experiment → Analysis
- Publication workflow - Analysis → Writing → Figure generation

## Prerequisites

- **Python 3.9+** (3.12+ recommended)
- **uv** package manager (recommended for fast installs)
- Platform: macOS, Linux, or Windows with WSL2
- Jupyter notebooks (recommended for interactive analysis)

## Best Practices

1. **Start with database queries**: Query PubMed, ChEMBL, UniProt before analysis
2. **Chain skills for workflows**: Literature → Hypothesis → Experiment → Analysis
3. **Document all steps**: Scientific reproducibility requires detailed logs
4. **Visualize early and often**: Use plotting skills to understand data
5. **Follow domain conventions**: PRISMA for reviews, Lipinski for drugs
6. **Use built-in workflows**: Don't reinvent literature review or hypothesis generation
7. **Cite sources**: Use citation-management skill for references

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
