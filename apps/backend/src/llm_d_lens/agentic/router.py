"""Independent HTTP API for Agentic Deploy orchestration."""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from llm_d_lens.auth.access import current_principal, owner_for_create

from .models import (
    AgenticCandidateRefinementRequest,
    AgenticCandidateSelectionRequest,
    AgenticDeploymentCreateRequest,
    AgenticDeploymentRun,
)
from .service import service
from .streaming import planning_stream_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agentic-deployments", tags=["agentic-deployments"])


@router.post(
    "",
    response_model=AgenticDeploymentRun,
    status_code=201,
    summary="Create a new Agentic Deployment plan.",
    description=(
        "Create a new Agentic Deployment plan. Provide the standard deployment inputs plus planning facts so Lens "
        "can propose, score, and stage candidate deployment topologies."
    ),
    operation_id="create_agentic_plan",
)
async def create_agentic_deployment(
    request: AgenticDeploymentCreateRequest,
    http_request: Request,
) -> AgenticDeploymentRun:
    try:
        principal = current_principal(http_request)
        return await service.create(request, principal_id=owner_for_create(principal))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/stream", summary="Create an Agentic Deployment plan with live progress events.")
async def stream_agentic_deployment(
    request: AgenticDeploymentCreateRequest,
    http_request: Request,
) -> StreamingResponse:
    principal = current_principal(http_request)
    principal_id = owner_for_create(principal)

    return planning_stream_response(
        lambda on_progress: service.create(request, on_progress=on_progress, principal_id=principal_id),
        expected_errors=(ValueError,),
        failure_message="Unable to generate an Agentic recommendation.",
        on_unexpected_error=lambda: logger.exception("Agentic recommendation generation failed"),
    )


@router.get(
    "",
    response_model=list[AgenticDeploymentRun],
    summary=(
        "List Agentic Deployment plans (recommendations) created in this Lens instance, with their current status."
    ),
    description=(
        "List Agentic Deployment plans (recommendations) created in this Lens instance, with their current status."
    ),
    operation_id="list_agentic_plans",
)
async def list_agentic_deployments() -> list[AgenticDeploymentRun]:
    return service.list()


@router.get(
    "/{run_id}",
    response_model=AgenticDeploymentRun,
    summary=(
        "Get the full detail of one Agentic Deployment plan: candidates, evidence, scoring source (deterministic vs."
    ),
    description=(
        "Get the full detail of one Agentic Deployment plan: candidates, evidence, scoring source (deterministic vs. "
    ),
    operation_id="get_agentic_plan",
)
async def get_agentic_deployment(run_id: str) -> AgenticDeploymentRun:
    run = service.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="agentic deployment run not found")
    return run


@router.post(
    "/{run_id}/select",
    response_model=AgenticDeploymentRun,
    summary="Select one candidate inside an existing Agentic Deployment plan.",
    description=(
        "Select one candidate inside an existing Agentic Deployment plan. Use this when the planner produced "
        "multiple candidates and you want to pin one before approval or refinement."
    ),
    operation_id="select_agentic_plan_candidate",
)
async def select_agentic_candidate(
    run_id: str,
    request: AgenticCandidateSelectionRequest,
) -> AgenticDeploymentRun:
    try:
        return service.select_candidate(run_id, request.candidate_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post(
    "/{run_id}/refine",
    response_model=AgenticDeploymentRun,
    summary="Ask Lens to refine an Agentic Deployment plan with a new planner prompt.",
    description=(
        "Ask Lens to refine an Agentic Deployment plan with a new planner prompt. Use this to request another "
        "planning pass with tighter constraints or different priorities."
    ),
    operation_id="refine_agentic_plan",
)
async def refine_agentic_deployment(
    run_id: str,
    request: AgenticCandidateRefinementRequest,
    http_request: Request,
) -> AgenticDeploymentRun:
    try:
        principal = current_principal(http_request)
        return await service.refine(run_id, request, principal_id=owner_for_create(principal))
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/{run_id}/refine/stream", summary="Refine an Agentic Deployment plan with live progress events.")
async def stream_refine_agentic_deployment(
    run_id: str,
    request: AgenticCandidateRefinementRequest,
    http_request: Request,
) -> StreamingResponse:
    principal = current_principal(http_request)
    principal_id = owner_for_create(principal)

    return planning_stream_response(
        lambda on_progress: service.refine(
            run_id,
            request,
            on_progress=on_progress,
            principal_id=principal_id,
        ),
        expected_errors=(KeyError, ValueError),
        failure_message="Unable to recalculate the Agentic recommendation.",
    )


@router.post(
    "/{run_id}/approve",
    response_model=AgenticDeploymentRun,
    status_code=202,
    summary="Approve an Agentic Deployment plan so Lens can begin executing it.",
    description=(
        "Approve an Agentic Deployment plan so Lens can begin executing it. "
        "Use this only after reviewing the selected candidate and evidence."
    ),
    operation_id="approve_agentic_plan",
)
async def approve_agentic_deployment(run_id: str, request: Request = None) -> AgenticDeploymentRun:
    try:
        return await service.approve(run_id, owner_user_id=owner_for_create(current_principal(request)))
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


from .optimization import MeasuredOptimizer, OptimizationRequest

optimizer = MeasuredOptimizer(service)


def _optimization_run(run_id, http_request):
    from llm_d_lens.auth.access import require_cluster_access
    from llm_d_lens.cluster.sessions import require_active_session

    run = service.get(run_id)
    if run is None:
        raise HTTPException(404, "Agentic plan not found")
    session = require_active_session(run.request.cluster_session_id)
    require_cluster_access(current_principal(http_request), session.server_id)
    return run


@router.post("/{run_id}/optimize", response_model=AgenticDeploymentRun, status_code=202,
    operation_id="optimize_agentic_plan", summary="Measure candidates within an explicit resource budget",
    description="Deploy, benchmark and clean up selected validated candidates sequentially using one workload. Return the best measured candidate subject to SLOs; this does not prove a global optimum.")
async def optimize_agentic_plan(run_id: str, request: OptimizationRequest, http_request: Request):
    run = _optimization_run(run_id, http_request)
    from llm_d_lens.auth.context import require_route_permission
    await require_route_permission(Request(dict(http_request.scope, path="/api/v1/evaluate/runs", method="POST")))
    try:
        from llm_d_lens.cluster.sessions import require_active_session
        return optimizer.start(run, request, http_request, owner_for_create(current_principal(http_request)), cluster_id=require_active_session(run.request.cluster_session_id).server_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/{run_id}/optimize/cancel", response_model=AgenticDeploymentRun,
    operation_id="cancel_agentic_optimization", summary="Stop measured optimization and clean up its test resources",
    description="Cancel an active measured candidate search and clean up only the deployments created by that search.")
async def cancel_agentic_optimization(run_id: str, http_request: Request, cluster_session_id: str | None = None):
    run = service.get(run_id)
    if run is None:
        raise HTTPException(404, "Agentic plan not found")
    if cluster_session_id and (run.optimization or {}).get('status') in {'interrupted', 'cleanup_failed'}:
        from llm_d_lens.cluster.sessions import require_active_session
        from llm_d_lens.auth.access import require_cluster_access
        session = require_active_session(cluster_session_id)
        if session.server_id != run.optimization.get('cluster_id'):
            raise HTTPException(409, "Cleanup session must refer to the original test cluster")
        require_cluster_access(current_principal(http_request), session.server_id)
        run.request = run.request.model_copy(update={'cluster_session_id': cluster_session_id})
    else:
        _optimization_run(run_id, http_request)
    return await optimizer.cancel(run_id)


@router.on_event("shutdown")
async def stop_measured_optimization():
    await optimizer.close()


@router.on_event("startup")
async def recover_measured_optimization():
    optimizer.recover()
