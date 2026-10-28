from copy import deepcopy

import pytest

from llm_d_lens.configuration.optimization_policy import resolve_optimization_policy


def workload(flags):
    return {'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': {'name': 'worker'}, 'spec': {'template': {'spec': {'containers': [{'name': 'modelserver', 'command': ['vllm', 'serve', 'test/model'], 'args': flags}]}}}}


def request(**policy):
    return {'guide': 'optimized-baseline', 'optimizationPolicy': {'mode': 'manual', **policy}}


def args(docs):
    return docs[0]['spec']['template']['spec']['containers'][0]['args']


def test_manual_enables_only_source_established_flags():
    docs = [workload(['--no-enable-prefix-caching', '--no-enable-chunked-prefill'])]
    source = request(prefixReuse='yes')
    original = deepcopy(source)
    output, decisions = resolve_optimization_policy(source, docs)
    assert args(docs) == ['--enable-prefix-caching', '--enable-chunked-prefill']
    assert source == original
    assert output['customParameters'] == []
    assert [d['status'] for d in decisions[:2]] == ['enabled', 'enabled']


def test_unknown_support_is_not_assumed():
    docs = [workload([])]
    _, decisions = resolve_optimization_policy(request(prefixReuse='yes'), docs)
    assert args(docs) == []
    assert all(d['status'] == 'needs_evidence' for d in decisions[:2])


def test_unknown_workload_and_agentic_do_not_enable_prefix():
    for policy in ({}, {'mode': 'agentic', 'prefixReuse': 'yes'}):
        docs = [workload(['--no-enable-prefix-caching'])]
        resolve_optimization_policy(request(**policy), docs)
        assert args(docs) == ['--no-enable-prefix-caching']


def test_inherited_flag_reports_effective_state_not_just_provenance():
    docs = [workload(['--enable-prefix-caching', '--no-enable-chunked-prefill'])]
    _, decisions = resolve_optimization_policy(request(mode='agentic'), docs)
    assert [item['status'] for item in decisions[:2]] == ['inherited', 'inherited']
    assert decisions[0]['effective_enabled'] is True
    assert decisions[1]['effective_enabled'] is False


def test_exclusion_replaces_flag_without_duplicate_polarities():
    docs = [workload(['--enable-prefix-caching'])]
    resolve_optimization_policy(request(excluded=['prefix']), docs)
    assert args(docs) == ['--no-enable-prefix-caching']


def test_unknown_exclusion_fails_instead_of_claiming_disabled():
    with pytest.raises(ValueError, match='cannot enforce exclusion'):
        resolve_optimization_policy(request(excluded=['prefix']), [workload([])])


def test_explicit_controls_are_preserved_and_conflicts_rejected():
    control = {'target': 'decode', 'kind': 'argument', 'name': 'enable-prefix-caching', 'value': ''}
    source = {**request(prefixReuse='yes'), 'customParameters': [control]}
    docs = [workload(['--no-enable-prefix-caching'])]
    output, decisions = resolve_optimization_policy(source, docs)
    assert output['customParameters'] == [control]
    assert decisions[0]['status'] == 'user_override'
    source['optimizationPolicy']['excluded'] = ['prefix']
    with pytest.raises(ValueError, match='explicit runtime override'):
        resolve_optimization_policy(source, docs)


def test_legacy_request_is_unchanged():
    source = {'guide': 'pd-disaggregation'}
    assert resolve_optimization_policy(source, []) == (source, [])


@pytest.mark.parametrize('flags', [['--enable-prefix-caching', 'false'], ['--enable-prefix-caching=false']])
def test_boolean_value_syntax_is_preserved(flags):
    docs = [workload(flags)]
    resolve_optimization_policy(request(prefixReuse='yes'), docs)
    assert args(docs) == (['--enable-prefix-caching', 'true'] if len(flags) == 2 else ['--enable-prefix-caching=true'])
