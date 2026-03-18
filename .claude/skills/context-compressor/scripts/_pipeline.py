#!/usr/bin/env python3
"""Composable pipeline primitives for skill compression flows."""

from __future__ import annotations

from dataclasses import dataclass
from inspect import isawaitable
from typing import Any, Callable


PipelineState = dict[str, Any]
PipelineFn = Callable[[PipelineState], PipelineState | Any]


class PipelineExecutionError(RuntimeError):
    """Raised when a pipeline stage fails."""

    def __init__(self, *, stage_name: str, cause: Exception):
        self.stage_name = stage_name
        self.cause = cause
        super().__init__(f"pipeline stage failed: stage='{stage_name}' cause='{cause}'")


@dataclass(frozen=True)
class PipelineStage:
    """One named pipeline stage."""

    name: str
    fn: PipelineFn


def run_pipeline(state: PipelineState, stages: list[PipelineStage]) -> PipelineState:
    """Run a synchronous pipeline."""
    current = state
    for stage in stages:
        try:
            result = stage.fn(current)
            if isawaitable(result):
                raise TypeError("run_pipeline received async stage result; use run_pipeline_async")
            current = result
        except Exception as exc:  # pragma: no cover - exercised by tests
            raise PipelineExecutionError(stage_name=stage.name, cause=exc) from exc
    return current


async def run_pipeline_async(state: PipelineState, stages: list[PipelineStage]) -> PipelineState:
    """Run a pipeline that can contain sync or async stage functions."""
    current = state
    for stage in stages:
        try:
            result = stage.fn(current)
            if isawaitable(result):
                current = await result
            else:
                current = result
        except Exception as exc:  # pragma: no cover - exercised by tests
            raise PipelineExecutionError(stage_name=stage.name, cause=exc) from exc
    return current
