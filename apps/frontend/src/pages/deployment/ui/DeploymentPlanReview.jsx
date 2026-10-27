import { lazy, Suspense, useMemo, useState } from 'react';
import { Badge, Button, Input, Panel, Select, LoadingState } from '../../../shared/ui';
import { CheckCircle2, Circle, GitBranch, ShieldCheck } from 'lucide-react';
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
    const workflow = [
        ['requirements', 'Requirements', true],
        ['decision', mode === 'agentic' ? 'Candidate selection' : 'Rule completion', true],
        ['review', 'Topology review', true],
        ['validate', 'Validate & generate', Boolean(content)],
        ['deploy', 'Deploy & observe', false],
    ];
    const enabledDecisions = decisions.filter(item => ['enabled', 'recommended', 'dependency', 'selected'].includes(String(item.status).toLowerCase())).length;
    const nextAction = content
        ? 'Review validation results, inspect any warnings, then continue to deployment.'
        : mode === 'agentic'
            ? 'Compare the recommendation and alternatives, then request a revision or approve the candidate.'
            : 'Review the automatically completed mechanisms and generate YAML to run compatibility checks.';
    return <Panel title="Configuration workbench" actions={<Badge tone="neutral">{mode === 'agentic' ? 'Agentic recommendation' : 'Manual configuration'}</Badge>}>
        <p className="text-sm text-theme-muted mb-4">{content ? 'The same configuration snapshot powers the topology, YAML and validation views. Generated resources and their declared relationships are not live cluster inventory.' : 'Candidate topology before YAML generation. A shared configuration snapshot is ready for review; performance claims remain unverified until a workload is measured.'}</p>
        <div className="mb-5 grid gap-2 sm:grid-cols-5" aria-label="Deployment workflow">
            {workflow.map(([id, label, complete], index) => <div key={id} className="relative flex items-center gap-2 rounded-lg border border-theme-border bg-theme-bg px-2.5 py-2">
                {complete ? <CheckCircle2 size={15} className="shrink-0 text-emerald-400" /> : <Circle size={15} className="shrink-0 text-theme-muted" />}
                <span className={`text-[11px] ${complete ? 'text-theme-text' : 'text-theme-muted'}`}>{label}</span>
                {index < workflow.length - 1 && <span className="absolute -right-2 hidden text-theme-muted sm:block">→</span>}
            </div>)}
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-theme-border bg-theme-bg p-3"><div className="flex items-center gap-2 text-xs font-semibold"><GitBranch size={14} className="text-cyan-400" />Topology</div><p className="mt-1 text-[11px] text-theme-muted">{plan.nodes.length} components · {plan.edges.length} declared relationships</p></div>
            <div className="rounded-lg border border-theme-border bg-theme-bg p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={14} className="text-emerald-400" />Validation</div><p className="mt-1 text-[11px] text-theme-muted">{content ? 'Generated resources available for checks' : 'Pending YAML generation'}</p></div>
            <div className="rounded-lg border border-theme-border bg-theme-bg p-3"><div className="text-xs font-semibold">Decision ledger</div><p className="mt-1 text-[11px] text-theme-muted">{enabledDecisions} selected or dependency decisions · {decisions.length} recorded</p></div>
        </div>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-3 py-2.5 text-[11px] text-cyan-100"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden="true" /><span><strong className="font-semibold">Next step:</strong> {nextAction}</span></div>
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Configuration view">{[['2d', 'Deployment topology (Overview)'], ['reason', 'Configuration basis'], ['3d', '3D editor (3D explorer)'], ...(content ? [['yaml', 'YAML']] : [])].map(([id, label]) => <Button key={id} size="sm" variant={view === id ? 'primary' : 'secondary'} aria-pressed={view === id} onClick={() => setView(id)}>{label}</Button>)}</div>
        {parsed.error && <p role="alert">Unable to display resources: {parsed.error}</p>}
        {view === 'reason' ? <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-theme-border p-3"><p className="text-[10px] uppercase tracking-wide text-theme-muted">Source</p><p className="mt-1 text-sm font-medium">{mode === 'agentic' ? 'Goal-driven candidate' : 'Deterministic completion'}</p></div><div className="rounded-lg border border-theme-border p-3"><p className="text-[10px] uppercase tracking-wide text-theme-muted">Evidence</p><p className="mt-1 text-sm font-medium">{content ? 'Generated and checkable' : 'Planning only'}</p></div><div className="rounded-lg border border-theme-border p-3"><p className="text-[10px] uppercase tracking-wide text-theme-muted">Performance</p><p className="mt-1 text-sm font-medium">{mode === 'agentic' ? 'Recommendation until measured' : 'Deployability first'}</p></div></div>
            {decisions.length ? decisions.map((item, index) => <div key={item.id || index} className="flex gap-3 border-b border-theme-border pb-3"><Badge tone={String(item.status).toLowerCase().includes('reject') ? 'danger' : String(item.status).toLowerCase().includes('unknown') ? 'warning' : 'success'}>{item.status}</Badge><div><strong className="text-sm">{item.label || item.id}</strong><p className="mt-1 text-sm text-theme-muted">{item.reason}</p></div></div>) : <p className="text-sm text-theme-muted">No optimization decisions were recorded. The configuration inherits the selected Guide defaults and explicit overrides.</p>}
        </div> : view === 'yaml' ? <pre tabIndex={0} aria-label="Generated YAML" className="max-h-96 overflow-auto text-xs whitespace-pre">{content}</pre> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">{view === '3d' ? <Suspense fallback={<LoadingState label="Loading 3D explorer" />}><Scene plan={plan} selected={selected} onSelect={select} /></Suspense> : <DeploymentPlanGraph plan={plan} selected={selected} onSelect={select} />}</div>
            <aside className="space-y-3 text-sm"><label className="block">Component<Select aria-label="Inspect component" value={selected} onChange={e => select(e.target.value)}><option value="">Choose a component</option>{plan.nodes.map(n => <option key={n.id} value={n.id}>{n.kind}: {n.name}</option>)}</Select></label>
                {node ? <><strong className="block break-all">{node.name}</strong><p className="text-theme-muted">{node.detail}</p>{node.namespace && <p>Namespace: {node.namespace}</p>}{node.containers?.map(c => <p key={c.name} className="text-xs break-all">{c.name}: {c.image || 'Image not declared'}</p>)}
                {onEdit && node.tier === 1 && node.role !== 'encode' && (!content || node.containers?.some(c => c.name === 'modelserver')) && <fieldset disabled={disabled} className="space-y-2"><legend className="font-medium">Adjust topology</legend><p className="text-xs text-theme-muted">{mode === 'agentic' ? 'The planner will evaluate this request and return a revised recommendation.' : 'Apply updates the topology fields for this model role. Generate YAML again to validate and review the new version.'} Previous performance evidence does not validate the edited configuration.</p><label className="block">Replicas<Input type="number" min="1" step="1" value={replicas} onChange={e => setReplicas(e.target.value)} /></label><label className="block">Tensor parallel size<Input type="number" min="1" step="1" value={tp} onChange={e => setTp(e.target.value)} /></label><Button size="sm" onClick={apply} disabled={!replicas && !tp}>{mode === 'agentic' ? 'Request revised candidate' : 'Apply to configuration'}</Button></fieldset>}
                </> : <p className="text-theme-muted">Select a component to view its parameters. Selecting it does not change the configuration.</p>}{error && <p role="alert">{error}</p>}
            </aside>
        </div>}
    </Panel>;
}
