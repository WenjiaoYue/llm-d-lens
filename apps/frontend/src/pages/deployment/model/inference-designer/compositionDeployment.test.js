import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { compositionDeployment, compositionRenderRequest, defaultInferenceEndpoint } from './compositionDeployment.js';

const documents = [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'cache-space' } },
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'worker', namespace: 'cache-space' }, spec: { template: { spec: { containers: [{ name: 'modelserver', args: ['Example/Model'], env: [{ name: 'ROUTER', value: 'router.cache-space.svc' }] }] } } } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'router', namespace: 'cache-space' }, spec: { ports: [{ name: 'http', port: 80 }] } },
];
const snapshot = (guidePlan = {}) => ({ target: { repository: '/source', accelerator: 'registered-profile' }, files: [
    { name: 'deployment.yaml', content: documents.map(doc => yaml.dump(doc)).join('---\n') },
    { name: 'provenance.json', content: JSON.stringify({ commit: 'a'.repeat(40), components: [{ path: 'guides/model' }], guidePlan, modelBinding: { namespace: 'cache-space', storageVolumeId: 'volume', pvcName: 'cache', model: 'Example/Model' } }) },
] });

test('managed composition preserves generated resources and rebinds namespace references', () => {
    const result = snapshot();
    const prepared = compositionRenderRequest(result, 'router:80');
    const actual = yaml.loadAll(prepared.render.rendered_manifest);
    assert.equal(actual.length, 2);
    assert.ok(actual.every(doc => !doc.metadata.namespace));
    assert.equal(actual[0].spec.template.spec.containers[0].env[0].value, 'router.__PRISM_NAMESPACE__.svc');
    assert.equal(prepared.candidate.runtime.storageVolumeId, 'volume');
    assert.deepEqual(prepared.deployment.readinessDeployments, ['worker']);
    assert.equal(prepared.deployment.endpoint.serviceName, 'router');
    assert.equal(compositionDeployment(result).documents[1].metadata.namespace, 'cache-space');
});

test('endpoint selection and existing-workload ownership are explicit', () => {
    assert.throws(() => compositionRenderRequest(snapshot(), 'missing:80'), /Choose the inference endpoint/);
    assert.throws(() => compositionRenderRequest(snapshot({ existingPoolIntegration: true }), 'router:80'), /existing workloads/);
});

test('default inference endpoint prefers the traffic entry over EPP and metrics ports', () => {
    const endpoints = [
        { value: 'model-epp:9002', serviceName: 'model-epp', port: 9002 },
        { value: 'model-epp:9090', serviceName: 'model-epp', port: 9090 },
        { value: 'model-router:80', serviceName: 'model-router', port: 80 },
    ];
    assert.equal(defaultInferenceEndpoint(endpoints), 'model-router:80');
    assert.equal(defaultInferenceEndpoint([{ value: 'only:8000', serviceName: 'only', port: 8000 }]), 'only:8000');
    assert.equal(defaultInferenceEndpoint(endpoints.slice(0, 2)), '');
    assert.equal(defaultInferenceEndpoint(endpoints.slice(0, 1)), '');
    assert.equal(defaultInferenceEndpoint(), '');
});

test('P/D Envoy traffic entry is selected despite sharing the EPP Service name', () => {
    const endpoints = [8000, 9002, 9090, 80].map(port => {
        const serviceName = port === 8000 ? 'pd-disaggregation-epp-model-servers' : 'pd-disaggregation-epp';
        return { value: `${serviceName}:${port}`, serviceName, port };
    });
    assert.equal(defaultInferenceEndpoint(endpoints), 'pd-disaggregation-epp:80');
    assert.equal(defaultInferenceEndpoint([{ value: 'metrics:80', serviceName: 'metrics', port: 80 }]), '');
});
