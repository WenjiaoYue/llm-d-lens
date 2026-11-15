import { Button } from '../../../../shared/ui';
import { DeploymentPlanGraph } from '../DeploymentPlanGraph';
import { optimizationFlowPlan } from '../../model/inference-designer/sceneGraph';

/** The same graph and editor callbacks drive both views; this is configuration, not live telemetry. */
export function InferenceFlowMap2D({ graph, selected, onSelect, onActivate, onConfigure, canConfigure, blocked = {}, intent, hardware, disabled = false }) {
    const unavailable = graph.capabilities.filter(cap => cap.unavailable && !cap.enabled && !cap.required
        && !['prefix', 'chunked', 'transfer', 'cache', 'affinity', 'index', 'parallel'].includes(cap.id));
    const plan = optimizationFlowPlan({
        ...graph,
        capabilities: graph.capabilities.filter(cap => !unavailable.some(item => item.id === cap.id) || selected === cap.id)
            .sort((left, right) => Number(right.enabled) - Number(left.enabled)),
    }, blocked, canConfigure);
    return <section className="inference-map inference-map-2d" aria-label="2D deployment configuration">
        <header className="inference-2d-summary"><strong>Optimization workflow</strong>
            {intent && <span>{intent.scenario} / {intent.objective} · Device budget: {intent.maxDevices || 'source demand'}</span>}
            <span>{graph.capabilities.filter(item => item.enabled).length} enabled optimizations</span>
            <span>{hardware ? 'Device counts checked; placement and performance unverified.' : 'Hardware checks pending generation.'}</span>
            <span>Click an optimization to edit it in the side panel. Not live cluster status.</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
            <DeploymentPlanGraph plan={plan} selected={selected} disabled={disabled}
                onSelect={id => { onSelect(id); if (id) onConfigure(id); }} onEdit={onConfigure} onToggle={onActivate} />
            {unavailable.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm text-theme-muted">Unavailable optimizations ({unavailable.length})</summary>
                <ul className="mt-2 space-y-2">{unavailable.map(cap => <li key={cap.id} className="text-xs text-theme-muted">
                    <Button size="xs" variant="ghost" onClick={() => { onSelect(cap.id); onConfigure(cap.id); }}>{cap.label}</Button>
                    <p className="px-2">{blocked[cap.id] || cap.sourceReason || cap.reason || 'Not supported by the selected source configuration.'}</p>
                </li>)}</ul>
            </details>}
        </div>
    </section>;
}
