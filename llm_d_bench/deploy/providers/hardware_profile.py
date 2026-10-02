"""Hardware identity for rendered deployment overlays.

The deploy providers render the XPU overlay in this release. These helpers read
device class, claim request name and overlay variant from the registered
hardware profile instead of hardcoding them, with literal fallbacks used only
when hardware discovery is unavailable.
"""

from __future__ import annotations

import os

from llm_d_bench.hardware.models import HardwareProfile
from llm_d_bench.hardware.resolver import resolve_by_accelerator_key

# Which hardware the deploy providers render for. A deployment targets one
# cluster's hardware, so this must not be pinned to Intel: the run's accelerator
# is supplied via ``PRISM_DEPLOY_ACCELERATOR`` (a profile accelerator key or its
# upstream variant). Unset/unknown keeps the previous Intel default.
_ACTIVE_ACCELERATOR_KEY = "xpu"
_ACCELERATOR_ENV = "PRISM_DEPLOY_ACCELERATOR"
_ACCELERATOR_ALIASES = {
    "xpu": "xpu",
    "intel": "intel_gpu",
    "intel-xpu": "intel_gpu",
    "intel_gpu": "intel_gpu",
    "gpu": "cuda",
    "nvidia": "cuda",
    "cuda": "cuda",
    "nvidia_gpu": "cuda",
}

DEFAULT_DEVICE_CLASS = "gpu.intel.com"
DEFAULT_CLAIM_REQUEST_NAME = "intel"
DEFAULT_OVERLAY_VARIANT = "xpu"


def _active_accelerator_key() -> str:
    value = (os.environ.get(_ACCELERATOR_ENV) or "").strip().lower()
    return _ACCELERATOR_ALIASES.get(value, _ACTIVE_ACCELERATOR_KEY)


def active_profile() -> HardwareProfile | None:
    """The hardware profile the deploy providers render for."""
    return resolve_by_accelerator_key(_active_accelerator_key())


def device_class(fallback: str = DEFAULT_DEVICE_CLASS) -> str:
    profile = active_profile()
    return (profile.deployment.device_class if profile else "") or fallback


def claim_request_name(fallback: str = DEFAULT_CLAIM_REQUEST_NAME) -> str:
    profile = active_profile()
    return (profile.deployment.claim_request_name if profile else "") or fallback


def overlay_variant(fallback: str = DEFAULT_OVERLAY_VARIANT) -> str:
    profile = active_profile()
    return (profile.deployment.arch if profile else "") or fallback


def accelerator_supported(key: str | None) -> bool:
    """True when a registered hardware profile supports this accelerator key."""
    if not key:
        return False
    return resolve_by_accelerator_key(str(key)) is not None


DEFAULT_REQUEST_MODEL = "dra"


def request_model(fallback: str = DEFAULT_REQUEST_MODEL) -> str:
    """How the profile requests accelerators: ``dra`` or ``extended-resource``."""
    profile = active_profile()
    return (profile.request_model if profile else "") or fallback


def requires_dra_claim() -> bool:
    return request_model() == "dra"


def resource_name(fallback: str | None = None) -> str | None:
    """Extended-resource key (e.g. ``nvidia.com/gpu``) for non-DRA profiles."""
    profile = active_profile()
    return (profile.deployment.resource_name if profile else None) or fallback


DEFAULT_RUNTIME_IMAGE = "ghcr.io/llm-d/llm-d-xpu:v0.9.0"


def runtime_image(fallback: str = DEFAULT_RUNTIME_IMAGE) -> str:
    """The vendor's llm-d model-server image (llm-d-cuda vs llm-d-xpu)."""
    profile = active_profile()
    return (profile.deployment.runtime_image if profile else None) or fallback


def set_accelerator_request(container: dict, claim: dict | None, count: int) -> None:
    """Set a tensor-parallel accelerator count on a rendered pod.

    DRA profiles rewrite the ResourceClaimTemplate count; extended-resource
    profiles set the container's ``resources.limits``/``requests`` entry for the
    profile's resource name.
    """
    if claim is not None:
        request = claim["spec"]["spec"]["devices"]["requests"][0]
        request.setdefault("exactly", {})["count"] = count
        return
    name = resource_name()
    if not name:
        raise ValueError("hardware profile defines neither a DRA claim nor an extended resource name")
    resources = container.setdefault("resources", {})
    resources.setdefault("limits", {})[name] = str(count)
    resources.setdefault("requests", {})[name] = str(count)
