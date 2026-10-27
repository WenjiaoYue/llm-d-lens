import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeploymentPlanReview } from './DeploymentPlanReview.jsx';
test('default review exposes an accessible overview and optional 3D, without claiming live state', () => {
    const html = renderToStaticMarkup(<DeploymentPlanReview content={'apiVersion: v1\nkind: Service\nmetadata:\n  name: endpoint'} />);
    assert.match(html, /Overview/);
    assert.match(html, /3D explorer/);
    assert.match(html, /not live cluster inventory/);
    assert.match(html, /Inspect component/);
    assert.match(html, /Service: endpoint/);
});
test('agentic review labels candidate evidence before rendering', () => {
    const html = renderToStaticMarkup(<DeploymentPlanReview mode="agentic" model="test/model" candidate={{ provider_ref: 'optimized-baseline', replicas: 1, tensor_parallel_size: 2 }} />);
    assert.match(html, /Candidate topology before YAML generation/);
    assert.doesNotMatch(html, /aria-label="Generated YAML"/);
});


test('measured optimization exposes resource budgets and an explicit deployment action', async () => {
    const { MeasuredOptimizationControls } = await import('./MeasuredOptimizationControls.jsx');
    const html = renderToStaticMarkup(<MeasuredOptimizationControls run={{ id: 'plan', status: 'awaiting_approval', candidates: [] }} onUpdate={() => {}} onReview={() => {}} />);
    assert.match(html, /Maximum GPUs/);
    assert.match(html, /Maximum minutes/);
    assert.match(html, /Repetitions per candidate/);
    assert.match(html, /Start deployment and benchmark tests/);
    assert.match(html, /best tested candidate/);
});
