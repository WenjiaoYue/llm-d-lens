"""Tests for the structured P/D disaggregation deployment adapter."""

import hashlib
import json
from pathlib import Path

import pytest

from llm_d_bench.deploy.providers.guide_adapter import GuideDeploymentArtifact
from llm_d_bench.deploy.providers.pd_disaggregation import PdDisaggregationAdapter


class _ReadinessRunner:
    def __init__(self) -> None:
        self.commands: list[list[str]] = []

    async def __call__(self, command: list[str]) -> tuple[int, str, str]:
        self.commands.append(command)
        if command[1:3] == ["get", "service"]:
            return (
                0,
                json.dumps(
                    {
                        "items": [
                            {
                                "metadata": {"name": "pd-disaggregation-epp"},
                                "spec": {
                                    "ports": [
                                        {"name": "grpc-ext-proc", "port": 9002},
                                        {"name": "http-metrics", "port": 9090},
                                        {"name": "http", "port": 80},
                                    ]
                                },
                            }
                        ],
                    }
                ),
                "",
            )
        return 0, "deployment successfully rolled out", ""


def _asset(name: str, content: str) -> dict[str, str]:
    return {"name": name, "content": content, "checksum": f"sha256:{hashlib.sha256(content.encode()).hexdigest()}"}


@pytest.mark.asyncio
async def test_deploy_uses_saved_bundle_when_original_guide_tree_is_missing(tmp_path: Path):
    runner = _ReadinessRunner()
    adapter = PdDisaggregationAdapter(
        runner,
        tmp_path / "removed-guide",
        "llm-d-bench-",
        30,
        Path("helm"),
        None,
    )
    bundle_commands: list[list[str]] = []

    async def bundle_runner(command):
        bundle_commands.append(command)
        if command[1:3] == ["get", "manifest"]:
            return 0, "kind: Deployment\nmetadata:\n  name: saved-router\n", ""
        return 0, "kind: Deployment\n", ""

    adapter._bundle_command_runner = bundle_runner
    manifest = tmp_path / "manifest.yaml"
    manifest.write_text("kind: Deployment\nmetadata:\n  name: saved-model\n", encoding="utf-8")
    bundle = {
        "schemaVersion": "guide-deployment-bundle.v1",
        "guide": "pd-disaggregation",
        "sourceCommit": "a" * 40,
        "helm": {
            "chart": "saved-chart",
            "version": "saved-version",
            "releaseName": "pd-disaggregation",
            "values": [_asset("router-effective.yaml", "router:\n  saved: true\n")],
        },
        "resources": [_asset("saved-resource.yaml", "kind: Service\nmetadata:\n  name: saved-service\n")],
    }
    artifact = GuideDeploymentArtifact(
        "pd-disaggregation",
        "hash",
        manifest_ref=str(manifest),
        source_ref="a" * 40,
        deployment_contract={"deploymentBundle": bundle},
    )

    execution = await adapter.deploy(artifact, {"namespace": "llm-d-bench-run"})

    assert any(command[:2] == ["kubectl", "apply"] for command in bundle_commands)
    assert not any("removed-guide" in " ".join(command) for command in bundle_commands + runner.commands)
    assert execution["router_effective_values"] == "router:\n  saved: true\n"
    assert execution["router_rendered_manifest"].endswith("name: saved-router\n")


@pytest.mark.asyncio
async def test_readiness_discovers_epp_router_service():
    runner = _ReadinessRunner()
    adapter = PdDisaggregationAdapter.__new__(PdDisaggregationAdapter)
    adapter._runner = runner
    adapter._timeout = 30
    execution = {"namespace": "llm-d-bench-run"}

    result = await adapter.readiness(execution)

    assert result.accepted
    assert execution["endpoint_url"] == "http://pd-disaggregation-epp.llm-d-bench-run.svc:80"
    assert runner.commands[-1] == [
        "kubectl",
        "get",
        "service",
        "--namespace",
        "llm-d-bench-run",
        "--output",
        "json",
    ]
