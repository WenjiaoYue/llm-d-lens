import yaml from 'js-yaml';

/** Graph identities include scope; edges are derived from resource references, never invented traffic. */
export function deploymentPlan(content = '') {
    const flatten = docs => docs.flatMap(doc => doc?.kind === 'List' ? flatten(doc.items || []) : doc ? [doc] : []);
    const documents = flatten(yaml.loadAll(content));
    const nodes = documents.filter(doc => doc.kind && doc.metadata?.name).map(doc => {
        const namespace = doc.metadata.namespace || '';
        const templates = doc.kind === 'Pod' ? [doc] : doc.kind === 'CronJob' ? [doc.spec?.jobTemplate?.spec?.template] : doc.kind === 'LeaderWorkerSet' ? [doc.spec?.leaderWorkerTemplate?.leaderTemplate, doc.spec?.leaderWorkerTemplate?.workerTemplate] : [doc.spec?.template];
        const containers = templates.flatMap(t => t?.spec?.containers || []);
        const kind = doc.kind;
        const labels = { ...templates.find(t => t?.metadata?.labels)?.metadata?.labels, ...doc.metadata.labels };
        const role = ['prefill', 'decode', 'encode'].find(value => labels['llm-d.ai/role'] === value || doc.metadata.name.toLowerCase().includes(value)) || 'serving';
        const tier = /Deployment|StatefulSet|DaemonSet|Pod|Job|LeaderWorkerSet/.test(kind) ? 1 : /PersistentVolume|ConfigMap|Secret|StorageClass/.test(kind) ? 2 : 0;
        return { id: `${doc.apiVersion}/${kind}/${namespace}/${doc.metadata.name}`, name: doc.metadata.name, namespace, kind, tier, role, document: doc, templates: templates.filter(Boolean), containers,
            detail: containers.length ? `${doc.spec?.replicas ?? 1} replicas · ${containers.length} containers` : namespace || 'Scope inherited at deployment' };
    });
    // DisaggregatedSet owns independently configurable prefill/decode role templates.
    for (const owner of [...nodes]) if (owner.kind === 'DisaggregatedSet') {
        for (const role of owner.document.spec?.roles || []) {
            const templates = [role.spec?.leaderWorkerTemplate?.leaderTemplate, role.spec?.leaderWorkerTemplate?.workerTemplate].filter(Boolean);
            nodes.push({ id: `${owner.id}/role/${role.name}`, owner: owner.id, role: role.name,
                name: `${owner.name}/${role.name}`, namespace: owner.namespace, kind: 'Model role', tier: 1,
                document: owner.document, templates, containers: templates.flatMap(t => t.spec?.containers || []),
                detail: `${role.spec?.replicas ?? 1} replicas · ${role.name} role` });
        }
    }
    const edges = [];
    const link = (a, b, label) => { if (a.id !== b.id && !edges.some(e => e.from === a.id && e.to === b.id && e.label === label)) edges.push({ from: a.id, to: b.id, label }); };
    const matches = (selector, labels) => selector && Object.keys(selector).length && Object.entries(selector).every(([k, v]) => labels?.[k] === v);
    for (const node of nodes) {
        if (node.owner) link(nodes.find(n => n.id === node.owner), node, 'owns');
        const doc = node.document;
        if (doc.kind === 'Service' || doc.kind === 'InferencePool') {
            const selector = doc.spec?.selector?.matchLabels || doc.spec?.selector;
            for (const target of nodes.filter(n => n.namespace === node.namespace && n.tier === 1)) if (target.templates.some(t => matches(selector, t.metadata?.labels))) link(node, target, 'selects');
        }
        for (const template of node.templates) {
            for (const volume of template.spec?.volumes || []) {
                const refs = [['PersistentVolumeClaim', volume.persistentVolumeClaim?.claimName], ['ConfigMap', volume.configMap?.name], ['Secret', volume.secret?.secretName]];
                for (const [kind, name] of refs) for (const target of nodes.filter(n => n.kind === kind && n.name === name && n.namespace === node.namespace)) link(target, node, 'mounted by');
            }
        }
        for (const rule of doc.spec?.rules || []) for (const ref of rule.backendRefs || []) {
            for (const target of nodes.filter(n => n.name === ref.name && n.kind === (ref.kind || 'Service') && n.namespace === (ref.namespace || node.namespace))) link(node, target, 'routes to');
        }
    }
    for (const node of [...nodes]) for (const [index, container] of (node.containers || []).entries()) {
        const args = [...(container.command || []), ...(container.args || [])];
        const position = args.findIndex(token => token === '--kv-transfer-config' || token.startsWith('--kv-transfer-config='));
        if (position < 0) continue;
        let config;
        try { config = JSON.parse(args[position].includes('=') ? args[position].slice(args[position].indexOf('=') + 1) : args[position + 1]); } catch { continue; }
        const connectors = config?.kv_connector === 'MultiConnector' ? config.kv_connector_extra_config?.connectors : [config];
        if (!Array.isArray(connectors)) continue;
        for (const [childIndex, connector] of connectors.entries()) {
            if (!connector?.kv_connector) continue;
            const cache = connector.kv_connector === 'OffloadingConnector';
            const bytes = connector.kv_connector_extra_config?.cpu_bytes_to_use;
            const child = { id: `${node.id}/connector/${index}/${childIndex}`, name: `${node.role}: ${connector.kv_connector}`,
                kind: cache ? 'Local KV cache' : 'KV transport', tier: 2, role: node.role, namespace: node.namespace,
                detail: cache ? `${bytes ? bytes / 1024 ** 3 : 'Source-defined'} GiB per model pod` : 'Transport configuration retained; runtime validation required' };
            nodes.push(child);
            link(node, child, cache ? 'offloads KV locally' : 'transfers KV');
        }
    }
    return { nodes, edges, content };
}

export function candidatePlan(candidate, model) {
    if (!candidate) return { nodes: [], edges: [], content: '' };
    const nodes = [{ id: 'model', name: model || 'Selected model', kind: 'Model requirement', tier: 0, detail: candidate.provider_ref }];
    if (candidate.prefill_replicas) nodes.push({ id: 'prefill', name: 'Prefill', kind: 'Planned workload', tier: 1, detail: `${candidate.prefill_replicas} replicas × TP ${candidate.prefill_tensor_parallel_size}` });
    nodes.push({ id: 'decode', name: candidate.prefill_replicas ? 'Decode' : 'Model server', kind: 'Planned workload', tier: 1, detail: `${candidate.replicas} replicas × TP ${candidate.tensor_parallel_size}` });
    const edges = nodes.slice(1).map(n => ({ from: 'model', to: n.id, label: 'served by' }));
    if (candidate.native_cpu_cache_gib) {
        for (const role of candidate.prefill_replicas ? ['prefill', 'decode'] : ['decode']) {
            nodes.push({ id: `${role}-cpu-cache`, name: `${role}: CPU KV cache`, kind: 'Planned local cache', tier: 2, detail: `${candidate.native_cpu_cache_gib} GiB per model pod · runtime validation pending` });
            edges.push({ from: role, to: `${role}-cpu-cache`, label: 'offloads KV locally' });
        }
        if (candidate.prefill_replicas) edges.push({ from: 'prefill', to: 'decode', label: 'NIXL transfer (planned)' });
    }
    return { nodes, edges, content: '' };
}

export function layoutPlan(plan) {
    return plan.nodes.map((node, index) => ({ ...node, x: 150 + node.tier * 310, y: 65 + plan.nodes.slice(0, index).filter(n => n.tier === node.tier).length * 110 }));
}
