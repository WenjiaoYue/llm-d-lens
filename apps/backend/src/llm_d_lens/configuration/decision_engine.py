"""Deterministic capability selection shared by Manual and Agentic planning."""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from .plan_models import ConfigurationPlan, DeploymentRequirements, OptimizationDecision, PlanRequest


CAPABILITIES = (
    ("prefix_cache", "Prefix reuse cache", "prefix_reuse", "Requires a known repeated-prefix workload."),
    ("chunked_prefill", "Chunked prefill", "long_context", "Useful for long inputs; runtime support must be present."),
    ("pd_disaggregation", "Prefill / Decode separation", "prefill_heavy", "Requires compatible transport and separate role resources."),
    ("external_kv_cache", "External KV cache", "long_context", "Consumes additional CPU/network capacity."),
    ("autoscaling", "Automatic scaling", "request_rate", "Requires a request-rate signal to size scaling bounds."),
)


def _plan_id(request: PlanRequest) -> str:
    digest = sha256(request.model_dump_json().encode()).hexdigest()[:12]
    return f"{request.mode}-{digest}"


def _decisions(requirements: DeploymentRequirements, mode: str) -> tuple[list[str], list[OptimizationDecision]]:
    workload = requirements.workload
    required = set(requirements.required_features)
    forbidden = set(requirements.forbidden_features)
    selected: list[str] = []
    decisions: list[OptimizationDecision] = []
    for capability_id, label, signal, explanation in CAPABILITIES:
        explicitly_required = capability_id in required
        explicitly_forbidden = capability_id in forbidden
        known = bool(workload.get(signal))
        if explicitly_forbidden:
            status = "user_disabled"
            reason = "Explicitly disabled by the user."
        elif explicitly_required and not known:
            status = "unknown"
            reason = f"Requested, but the prerequisite signal {signal!r} is unknown."
        elif explicitly_required or (mode == "manual" and known):
            status = "enabled"
            reason = "Prerequisites are present and the capability fits the requested mode."
            selected.append(capability_id)
        elif known:
            status = "excluded" if mode == "agentic" else "enabled"
            reason = "Agentic keeps it as an alternative until its expected benefit is compared." if mode == "agentic" else "Automatically enabled because the prerequisite signal is present."
            if status == "enabled":
                selected.append(capability_id)
        else:
            status = "unknown"
            reason = explanation
        decisions.append(OptimizationDecision(capability_id=capability_id, label=label, status=status, reason=reason))
    return selected, decisions


def build_plan(request: PlanRequest) -> ConfigurationPlan:
    selected, decisions = _decisions(request.requirements, request.mode)
    budget = request.requirements.hard_constraints.get("maxAccelerators")
    candidates = []
    if request.mode == "agentic":
        for index in range(request.candidate_limit):
            capabilities = selected[:]
            if index and capabilities:
                capabilities = capabilities[:-index] or capabilities
            candidates.append({"id": f"candidate-{index + 1}", "capabilities": capabilities, "rank": index + 1, "evidence_level": "recommendation", "tradeoff": "Compared against the requested objective and hard constraints."})
    return ConfigurationPlan(
        plan_id=_plan_id(request), mode=request.mode, requirements=request.requirements,
        selected_capabilities=selected, decisions=decisions,
        resource_estimate={"max_accelerators": budget, "status": "bounded" if budget else "unknown"},
        candidates=candidates, evidence_level="recommendation",
        validation={"status": "pending", "checks": ["capability prerequisites", "conflicts", "resource budget"]},
    )

