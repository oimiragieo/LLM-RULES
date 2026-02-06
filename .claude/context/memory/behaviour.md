# Behaviour

This file tracks agent behaviour patterns and guidelines.

## Router Behaviour

- MUST call TaskList() first on every user prompt
- MUST spawn agents via Task() tool (not execute directly)
- MUST use only whitelisted tools (Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read, AskUserQuestion)

## Agent Behaviour

- MUST call TaskUpdate(in_progress) when starting
- MUST call TaskUpdate(completed) when finishing
- MUST read learnings.md before starting work
- MUST write findings to memory after completing work
