import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InferenceFlowMap2D } from './InferenceFlowMap2D';
import { inferenceScene } from '../../model/inference-designer/sceneGraph';
import { createBlueprint } from '../../model/inference-designer/blueprint';

const graph = inferenceScene(createBlueprint(), 'Fixture cluster');
const render = props => renderToStaticMarkup(<InferenceFlowMap2D graph={graph} canConfigure={() => true} onConfigure={() => {}} onActivate={() => {}} {...props} />);

test('2D graph exposes independent edit actions and explicit configuration status', () => {
    const html = render({ selected: 'prefix' });
    assert.match(html, /2D deployment configuration/);
    assert.match(html, /Edit Prefix caching/);
    assert.match(html, /Not live cluster status/);
    assert.match(html, /Optimization applies to stage/);
    assert.match(render({}), /Edit Prefix caching/);
    assert.match(html, /edit it in the side panel/);
    assert.doesNotMatch(html, /<canvas/);
});

test('selection provides a separate toggle and prerequisite explanation', () => {
    const html = render({ selected: 'prefix', blocked: { prefix: 'Hardware prerequisites are unknown.' } });
    assert.match(html, /Hardware prerequisites are unknown/);
    assert.match(html, /disabled=""/);
});

test('2D shows logical flow rather than Kubernetes resource inventory', () => {
    const html = render({});
    assert.match(html, /Endpoint selection/);
    assert.doesNotMatch(html, /Fixture cluster|Kubernetes nodes/);
});

test('read-only graph keeps inspectable nodes but disables edits and toggles', () => {
    const html = render({ disabled: true });
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Edit Prefix caching"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="(?:Enable|Disable) Prefix caching"/);
    assert.match(html, /aria-label="Request path: Endpoint selection"/);
});

test('unsupported catalog entries stay inspectable without crowding the default flow', () => {
    const html = render({});
    assert.match(html, /<details[^>]*><summary[^>]*>Unavailable optimizations/);
    const speculation = graph.capabilities.find(cap => cap.id === 'speculation');
    assert.ok(!html.includes(`aria-label="Optimization: ${speculation.label}"`));
    assert.ok(html.includes(speculation.label));
    assert.ok(render({ selected: 'speculation' }).includes(`aria-label="Optimization: ${speculation.label}"`));
});
