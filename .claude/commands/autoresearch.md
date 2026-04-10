---
description: Scaffold a karpathy/autoresearch ML template and launch an autonomous optimization loop
disable-model-invocation: true
---

I want to run an autonomous machine learning experiment using the karpathy/autoresearch framework. Please carefully copy all the files from `.claude/templates/autoresearch/` into a new isolated folder named `.claude/context/experiments/autoresearch-<timestamp>/`. Once the template is copied over, spawn the `ml-researcher` agent locked only to that isolated directory. Instruct the agent to test the following architectural hypothesis using a strict 5-minute training budget:

$ARGUMENTS
