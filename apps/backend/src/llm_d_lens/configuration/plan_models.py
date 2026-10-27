"""Shared intent and decision-plan contracts for Manual and Agentic deployment."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class DeploymentRequirements(BaseModel):
    model: str = Field(min_length=1)
    cluster_id: str | None = None
    objective: Literal["latency", "throughput", "cost", "reliability"] = "throughput"
    hard_constraints: dict[str, Any] = Field(default_factory=dict)
    workload: dict[str, Any] = Field(default_factory=dict)
    performance_targets: dict[str, Any] = Field(default_factory=dict)
    required_features: list[str] = Field(default_factory=list)
    forbidden_features: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)


class OptimizationDecision(BaseModel):
    capability_id: str
    label: str
    status: Literal["enabled", "dependency", "excluded", "unknown", "conflict", "user_disabled"]
    reason: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class ConfigurationPlan(BaseModel):
    plan_id: str
    mode: Literal["manual", "agentic"]
    requirements: DeploymentRequirements
    selected_capabilities: list[str] = Field(default_factory=list)
    decisions: list[OptimizationDecision] = Field(default_factory=list)
    resource_estimate: dict[str, Any] = Field(default_factory=dict)
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    evidence_level: Literal["recommendation", "predicted", "validated"] = "recommendation"
    validation: dict[str, Any] = Field(default_factory=dict)
    configuration: dict[str, Any] = Field(default_factory=dict)


class PlanRequest(BaseModel):
    mode: Literal["manual", "agentic"]
    requirements: DeploymentRequirements
    candidate_limit: int = Field(default=3, ge=1, le=10)

