<!-- Agent: {{agent_type}} | Task: #{{task_id}} | Session: {{date}} -->

# Research Report: {{topic}}

**Date**: {{date}}
**Researcher**: {{agent_type}} agent
**Task**: #{{task_id}}
**Batch/Phase**: {{batch_phase}}
**Sources Consulted**: {{source_count}}

---

## Executive Summary

{{summary}}

---

## Research Methodology

### Search Queries Executed

| #   | Query | Source | Results Found |
| --- | ----- | ------ | ------------- |

{{#queries}}
| {{number}} | {{query}} | {{source}} | {{result_count}} |
{{/queries}}

### Sources Consulted

| #   | Title | Type | URL | Date |
| --- | ----- | ---- | --- | ---- |

{{#sources}}
| {{number}} | {{title}} | {{type}} | {{url}} | {{date}} |
{{/sources}}

---

## Detailed Findings

### Topic 1: {{topic_name}}

**Key Insights:**

- {{insight_1}}
- {{insight_2}}
- {{insight_3}}

**Evidence:**
{{evidence}}

**Relevance to Our Framework:**
{{relevance}}

### Topic N: {{topic_name}}

(repeat structure)

---

## Academic References

{{#arxiv_papers}}

### {{number}}. {{title}} ({{year}})

- **Authors**: {{authors}}
- **Key Insight**: {{insight}}
- **Relevance**: {{relevance}}
- **URL**: {{url}}
  {{/arxiv_papers}}

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

{{#p0_recommendations}}

- {{recommendation}}
  {{/p0_recommendations}}

### P1 (Soon — Next Sprint)

{{#p1_recommendations}}

- {{recommendation}}
  {{/p1_recommendations}}

### P2 (Future — Backlog)

{{#p2_recommendations}}

- {{recommendation}}
  {{/p2_recommendations}}

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |

{{#risks}}
| {{risk}} | {{impact}} | {{probability}} | {{mitigation}} |
{{/risks}}

---

## Implementation Roadmap

{{roadmap}}

---

## Appendix: Raw Search Results

(Optional - include if results are particularly valuable for reference)
