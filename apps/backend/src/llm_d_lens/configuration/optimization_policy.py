"""Explainable optimization completion constrained by the pinned source capabilities.

Topology recipes remain provider-owned. Unknown runtime compatibility is reported,
never inferred from an engine name or silently enabled.
"""
from copy import deepcopy

from llm_d_lens.configuration.manifest_facts import _invocation_tokens, workload_roles


def resolve_optimization_policy(request: dict, documents: list[dict]) -> tuple[dict, list[dict]]:
    policy = request.get('optimizationPolicy')
    if not policy:
        return request, []
    if not isinstance(policy, dict) or policy.get('mode') not in {'manual', 'agentic'}:
        raise ValueError('Select a valid optimization policy mode.')
    reuse = policy.get('prefixReuse', 'unknown')
    if reuse not in {'unknown', 'yes', 'no'}:
        raise ValueError('Prefix reuse must be unknown, yes or no.')
    excluded = policy.get('excluded', [])
    allowed = {'prefix', 'chunked'}
    if not isinstance(excluded, list) or any(not isinstance(x, str) or x not in allowed for x in excluded):
        raise ValueError('Unknown excluded optimization.')
    output = deepcopy(request)
    overrides = output.setdefault('customParameters', [])
    if not isinstance(overrides, list):
        raise ValueError('Runtime overrides must be a list.')
    containers = [c for w in workload_roles(documents) for c in w['pod'].get('containers', []) if c.get('name') == 'modelserver']
    tokens = []
    for container in containers:
        try:
            command = container.get('command') or []
            if command and command[0].rsplit('/', 1)[-1] in {'sh', 'bash'}:
                tokens.append([])
            else:
                tokens.append(_invocation_tokens(container, "optimization policy"))
        except ValueError:
            tokens.append([])

    def set_flag(argument, enabled):
        # Only source-established BooleanOptionalAction flags on direct invocations.
        for container in containers:
            style = 'switch'
            for field in ('command', 'args'):
                original, cleaned = container.get(field, []), []
                index = 0
                while index < len(original):
                    token = original[index]
                    if token.split('=')[0] in {'--' + argument, '--no-' + argument}:
                        if '=' in token:
                            style = 'equals'
                        elif index + 1 < len(original) and original[index + 1].lower() in {'true', 'false'}:
                            style = 'value'
                            index += 1
                    else:
                        cleaned.append(token)
                    index += 1
                container[field] = cleaned
            value = str(enabled).lower()
            if style == 'equals':
                container['args'].append('--' + argument + '=' + value)
            elif style == 'value':
                container['args'].extend(['--' + argument, value])
            else:
                container['args'].append('--' + ('' if enabled else 'no-') + argument)
    decisions = []
    for key, label, argument in [('prefix', 'Prefix caching', 'enable-prefix-caching'), ('chunked', 'Chunked prefill', 'enable-chunked-prefill')]:
        positive, negative = '--' + argument, '--no-' + argument
        explicit = [x for x in overrides if isinstance(x, dict) and x.get('kind') == 'argument' and x.get('name') in {argument, 'no-' + argument}]
        known = bool(tokens) and all(any(t.split('=')[0] in {positive, negative} for t in command) for command in tokens)
        enabled = known and all(any(t == positive or t.lower() == positive + '=true' for t in command) and not any(t == negative or t.lower() == positive + '=false' or (t == positive and i + 1 < len(command) and command[i + 1].lower() == 'false') for i, t in enumerate(command)) for command in tokens)
        status, reason = 'needs_evidence', 'The pinned source does not establish this flag for every model role; no automatic override was added.'
        if explicit and key in excluded:
            raise ValueError(f'{label}: remove the explicit runtime override before excluding this optimization.')
        if explicit:
            status, reason = 'user_override', 'Explicit role-scoped runtime overrides take precedence over automatic completion.'
        elif key in excluded:
            if not known:
                raise ValueError(f'{label}: cannot enforce exclusion because the pinned source does not establish a supported runtime flag.')
            set_flag(argument, False)
            status, reason = 'disabled', 'Explicitly disabled by the user.'
        elif enabled:
            status, reason = 'inherited', 'Already enabled by the selected Guide; its source-owned settings are preserved.'
        elif known and policy['mode'] == 'manual' and (key != 'prefix' or reuse == 'yes'):
            set_flag(argument, True)
            status, reason = 'enabled', 'Enabled by Manual completion using a flag declared by the pinned source.'
        elif known:
            status, reason = 'inherited', 'Preserved the source setting; additional workload evidence or an explicit choice is needed.'
        effective_enabled = True if status == 'enabled' else enabled if status == 'inherited' else False if status == 'disabled' else None
        decisions.append({'id': key, 'label': label, 'status': status, 'reason': reason, 'effective_enabled': effective_enabled})
    for guide, label in [('pd-disaggregation', 'Prefill / Decode separation'), ('precise-prefix-cache-routing', 'Precise cache routing'), ('tiered-prefix-cache', 'External KV cache')]:
        selected = request.get('guide') == guide
        decisions.append({'id': guide, 'label': label, 'status': 'selected' if selected else 'alternative', 'reason': 'Selected provider owns this topology and its dependencies.' if selected else 'A separate provider recipe; not overlaid without a validated combined adapter.'})
    decisions.append({'id': 'performance', 'label': 'Performance evidence', 'status': 'unverified', 'reason': 'Configuration generation does not prove workload performance. Benchmark before claiming an optimum.'})
    return output, decisions
