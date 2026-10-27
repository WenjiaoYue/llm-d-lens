import { lazy, Suspense, useMemo, useState } from 'react';
import { Badge, Button, Input, Panel, Select, LoadingState } from '../../../shared/ui';
import { deploymentPlan, candidatePlan } from '../model/deploymentPlan';
import { DeploymentPlanGraph } from './DeploymentPlanGraph';
const Scene = lazy(() => import('./DeploymentPlanScene'));

/** Both modes inspect one snapshot; edits go back through the existing validated generation path. */
export function DeploymentPlanReview({ content = '', candidate, model, mode = 'manual', decisions = [], onEdit, disabled = false }) {
    const [view, setView] = useState('2d'), [selected, setSelected] = useState('');
    const [replicas, setReplicas] = useState(''), [tp, setTp] = useState(''), [error, setError] = useState('');
    const parsed = useMemo(() => { try { return { plan: content ? deploymentPlan(content) : candidatePlan(candidate, model) }; } catch (e) { return { error: e.message, plan: { nodes: [], edges: [] } }; } }, [content, candidate, model]);
    const plan = parsed.plan, node = plan.nodes.find(n => n.id === selected);
    const select = id => { setSelected(id); setReplicas(''); setTp(''); setError(''); };
    const apply = async () => {
        const patch = {};
        for (const [key, value] of [['replicas', replicas], ['tensorParallelSize', tp]]) if (value !== '') { if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) { setError('Enter positive whole numbers.'); return; } patch[key] = Number(value); }
        if (!Object.keys(patch).length) return;
        try { await onEdit({ node, patch }); setReplicas(''); setTp(''); setError(''); } catch (e) { setError(e.message || 'Unable to update configuration.'); }
    };
    return <Panel title="Review your configuration" actions={<Badge tone="neutral">{mode === 'agentic' ? 'Agentic recommendation' : 'Manual configuration'}</Badge>}>
        <p className="text-sm text-theme-muted mb-3">{content ? 'Generated resources and their declared relationships. This is not live cluster inventory.' : 'Candidate topology before YAML generation. Performance is not confirmed by this view.'}</p>
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Configuration view">{[['2d', 'Overview'], ['3d', '3D explorer'], ['reason', 'Selection reasons'], ...(content ? [['yaml', 'YAML']] : [])].map(([id, label]) => <Button key={id} size="sm" variant={view === id ? 'primary' : 'secondary'} aria-pressed={view === id} onClick={() => setView(id)}>{label}</Button>)}</div>
        {parsed.error && <p role="alert">Unable to display resources: {parsed.error}</p>}
        {view === 'reason' ? <div className="space-y-3">{decisions.length ? decisions.map((item, index) => <div key={item.id || index} className="border-b border-theme-border pb-2"><strong className="text-sm">{item.label || item.id}</strong><Badge tone="neutral">{item.status}</Badge><p className="text-sm text-theme-muted">{item.reason}</p></div>) : <p className="text-sm text-theme-muted">This configuration inherits the selected Guide defaults and explicit overrides. No additional optimization decisions were recorded.</p>}</div> : view === 'yaml' ? <pre tabIndex={0} aria-label="Generated YAML" className="max-h-96 overflow-auto text-xs whitespace-pre">{content}</pre> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">{view === '3d' ? <Suspense fallback={<LoadingState label="Loading 3D explorer" />}><Scene plan={plan} selected={selected} onSelect={select} /></Suspense> : <DeploymentPlanGraph plan={plan} selected={selected} onSelect={select} />}</div>
            <aside className="space-y-3 text-sm"><label className="block">Component<Select aria-label="Inspect component" value={selected} onChange={e => select(e.target.value)}><option value="">Choose a component</option>{plan.nodes.map(n => <option key={n.id} value={n.id}>{n.kind}: {n.name}</option>)}</Select></label>
                {node ? <><strong className="block break-all">{node.name}</strong><p className="text-theme-muted">{node.detail}</p>{node.namespace && <p>Namespace: {node.namespace}</p>}{node.containers?.map(c => <p key={c.name} className="text-xs break-all">{c.name}: {c.image || 'Image not declared'}</p>)}
                {onEdit && node.tier === 1 && node.role !== 'encode' && (!content || node.containers?.some(c => c.name === 'modelserver')) && <fieldset disabled={disabled} className="space-y-2"><legend className="font-medium">Adjust topology</legend><p className="text-xs text-theme-muted">{mode === 'agentic' ? 'The planner will evaluate this request and return a revised recommendation.' : 'Apply updates the topology fields for this model role. Generate YAML again to validate and review the new version.'} Previous performance evidence does not validate the edited configuration.</p><label className="block">Replicas<Input type="number" min="1" step="1" value={replicas} onChange={e => setReplicas(e.target.value)} /></label><label className="block">Tensor parallel size<Input type="number" min="1" step="1" value={tp} onChange={e => setTp(e.target.value)} /></label><Button size="sm" onClick={apply} disabled={!replicas && !tp}>{mode === 'agentic' ? 'Request revised candidate' : 'Apply to configuration'}</Button></fieldset>}
                </> : <p className="text-theme-muted">Select a component to view its parameters. Selecting it does not change the configuration.</p>}{error && <p role="alert">{error}</p>}
            </aside>
        </div>}
    </Panel>;
}
