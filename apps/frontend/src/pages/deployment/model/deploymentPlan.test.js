import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { deploymentPlan, candidatePlan } from './deploymentPlan.js';

const service = namespace => ({ apiVersion: 'v1', kind: 'Service', metadata: { name: 'inference', namespace }, spec: { selector: { app: 'worker' } } });
const worker = namespace => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'worker', namespace }, spec: { template: { metadata: { labels: { app: 'worker' } }, spec: { containers: [{ name: 'modelserver' }], volumes: [{ persistentVolumeClaim: { claimName: 'weights' } }] } } } });
test('relationships preserve namespace scope and only use declared references', () => {
    const docs = [service('a'), worker('a'), worker('b'), { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: 'weights', namespace: 'a' } }];
    const plan = deploymentPlan(yaml.dump({ apiVersion: 'v1', kind: 'List', items: docs }));
    assert.equal(plan.nodes.length, 4);
    assert.equal(plan.edges.length, 2);
    assert.ok(plan.edges.every(e => !e.to.includes('/b/')));
});
test('empty selectors do not invent service relationships', () => {
    const svc = service('a'); svc.spec.selector = {};
    assert.equal(deploymentPlan(yaml.dump({ kind: 'List', items: [svc, worker('a')] })).edges.length, 0);
});
test('malformed YAML remains an error, not an empty valid plan', () => {
    assert.throws(() => deploymentPlan('items: [broken'));
});
test('candidate review describes intent without invented services or manifests', () => {
    const plan = candidatePlan({ provider_ref: 'pd-disaggregation', replicas: 2, tensor_parallel_size: 4, prefill_replicas: 1, prefill_tensor_parallel_size: 2 }, 'test/model');
    assert.equal(plan.nodes.length, 3);
    assert.equal(plan.content, '');
    assert.ok(plan.nodes.every(n => !n.document));
});

test('DisaggregatedSet exposes separately inspectable model roles', () => {
    const document = { apiVersion: 'disaggregatedset.x-k8s.io/v1', kind: 'DisaggregatedSet', metadata: { name: 'pd' }, spec: { roles: ['prefill', 'decode'].map(name => ({ name, spec: { replicas: 2, leaderWorkerTemplate: { workerTemplate: { spec: { containers: [{ name: 'modelserver' }] } } } } })) } };
    const plan = deploymentPlan(yaml.dump(document));
    assert.equal(plan.nodes.length, 3);
    assert.deepEqual(plan.nodes.filter(n => n.owner).map(n => n.role), ['prefill', 'decode']);
    assert.equal(plan.edges.filter(e => e.label === 'owns').length, 2);
});


test('P/D composition shows independent local caches and a planned transport', () => {
    const plan = candidatePlan({ provider_ref: 'pd-disaggregation', replicas: 2, prefill_replicas: 1, native_cpu_cache_gib: 4 }, 'test');
    assert.equal(plan.nodes.filter(n => n.kind === 'Planned local cache').length, 2);
    assert.ok(plan.edges.some(e => e.from === 'prefill' && e.to === 'decode'));
});

test('manifest review exposes ordered transport and local cache children', () => {
    const doc = worker('a');
    doc.spec.template.spec.containers[0].args = ['--kv-transfer-config', JSON.stringify({ kv_connector: 'MultiConnector', kv_connector_extra_config: { connectors: [{ kv_connector: 'NixlConnector' }, { kv_connector: 'OffloadingConnector', kv_connector_extra_config: { cpu_bytes_to_use: 4 * 1024 ** 3 } }] } })];
    const plan = deploymentPlan(yaml.dump(doc));
    assert.equal(plan.nodes.length, 3);
    assert.deepEqual(plan.edges.map(e => e.label), ['transfers KV', 'offloads KV locally']);
});
