import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationApi, resolveEvaluationTarget } from './client.js';

test('evaluation adapter preserves validation-array details and field labels', async (t) => {
    const detail = [{loc:['body','name'],msg:'Required'}];
    t.mock.method(globalThis, 'fetch', async () => Response.json({detail},{status:422}));
    await assert.rejects(evaluationApi('/test'), error => {
        assert.equal(error.message,'name: Required');
        assert.equal(error.status,422);
        assert.deepEqual(error.details,detail);
        return true;
    });
});


test('submission resolves saved and forwarded deployment endpoints', () => {
    const readyDeployments = [{execution_id: 'exec-1', endpoint: 'http://model:8000', forwarded_endpoint: 'http://localhost:9000'}];
    assert.equal(resolveEvaluationTarget({targetId: 'exec-1', endpointSource: 'discovered', readyDeployments}), 'exec-1');
    for (const customEndpoint of ['http://model:8000/', 'http://localhost:9000']) {
        assert.equal(resolveEvaluationTarget({endpointSource: 'url', customEndpoint, readyDeployments}), 'exec-1');
    }
    assert.throws(() => resolveEvaluationTarget({endpointSource: 'url', customEndpoint: 'bad', readyDeployments}), /valid endpoint URL/);
    assert.throws(() => resolveEvaluationTarget({endpointSource: 'url', customEndpoint: 'http://other', readyDeployments}), /not linked/);
    assert.throws(() => resolveEvaluationTarget({endpointSource: 'discovered', targetId: ''}), /Select an available endpoint/);
});
