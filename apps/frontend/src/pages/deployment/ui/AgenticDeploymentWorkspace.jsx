import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingState, ModulePage, Panel, Select } from '../../../shared/ui';
import { requestJson } from '../../../shared/api/httpClient';
import { usePolling } from '../../../shared/lib/usePolling';
import { cn } from '../../../shared/lib/cn';
import { useAuth } from '../../auth';
import { listAIProviders } from '../../ai-providers';
import { DeploymentRequirementsForm } from './DeploymentRequirementsForm';
import { DeploymentPlanReview } from './DeploymentPlanReview';
import { MeasuredOptimizationControls } from './MeasuredOptimizationControls';
import { candidateEvidence, defaultRequirements, deploymentPlanningRequest, requirementsFromRun, streamAgenticRecommendation } from '../api/agenticDeploymentBackend';

const api = (path, body) => requestJson(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export function DeploymentWorkflow({ draft, mode = 'agentic', embedded = false, onBack, onDeploymentStarted }) {
    const { can } = useAuth();
    const permitted = can('deployment:run:create');
    const [run, setRun] = useState(null), [requirements, setRequirements] = useState(() => defaultRequirements(draft?.contextLength));
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [events, setEvents] = useState([]);
    const [providers, setProviders] = useState([]), [provider, setProvider] = useState('');
    const [restoring, setRestoring] = useState(true), [reviewedChecksum, setReviewedChecksum] = useState('');
    const [editing, setEditing] = useState(false);
    const abort = useRef(null), mounted = useRef(true);
    const key = `lens-deployment-plan:${mode}:${draft?.clusterId}:${draft?.model}:${draft?.deploymentName}`;
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; abort.current?.abort(); };
    }, []);
    useEffect(() => {
        let active = true;
        setRun(null); setReviewedChecksum(''); setRestoring(true);
        setRequirements(defaultRequirements(draft?.contextLength)); setProvider('');
        const id = sessionStorage.getItem(key);
        if (!id) { setRestoring(false); return undefined; }
        api(`/api/agentic-deployments/${encodeURIComponent(id)}`).then(value => {
            if (active) {
                setRequirements(requirementsFromRun(value));
                setProvider(value.request.ai_provider_id || '');
                setRun(value);
            }
        }).catch(failure => { if (active) setError(`Unable to restore the saved plan: ${failure.message}`); })
            .finally(() => { if (active) setRestoring(false); });
        return () => { active = false; };
    }, [key, draft?.contextLength]);
    useEffect(() => {
        if (mode !== 'agentic') return undefined;
        let active = true;
        listAIProviders().then(items => { if (active) setProviders(items); })
            .catch(failure => { if (active) setError(`Unable to load AI providers: ${failure.message}`); });
        return () => { active = false; };
    }, [mode]);
    const accept = value => {
        if (!mounted.current) return;
        setRun(value); setReviewedChecksum(''); sessionStorage.setItem(key, value.id);
    };
    const active = run?.status === 'optimizing' || run?.status === 'deploying';
    usePolling(async () => {
        if (!run) return;
        try {
            const value = await api(`/api/agentic-deployments/${encodeURIComponent(run.id)}`);
            if (mounted.current) setRun(value);
        } catch (failure) { if (mounted.current) setError(failure.message); }
    }, { enabled: Boolean(run) && !busy, intervalMs: active ? 5000 : 15000 });
    const generate = async value => {
        setRequirements(value); setBusy(true); setError(''); setReviewedChecksum(''); setEvents([]);
        const controller = new AbortController();
        abort.current = controller;
        try {
            const session = await api(`/api/cluster/session?clusterId=${encodeURIComponent(draft.clusterId)}`);
            const payload = deploymentPlanningRequest(draft, value, session.sessionId || session.session_id, mode, provider);
            let result;
            await streamAgenticRecommendation(payload, (type, data) => {
                if (type === 'progress' && mounted.current) setEvents(current => [...current.slice(-29), data]);
                if (type === 'complete') result = data;
                if (type === 'error') throw new Error(data.message || 'Planning failed.');
            }, controller.signal);
            if (!result) throw new Error('Planning ended without a validated configuration.');
            accept(result);
            if (mode === 'manual') {
                setEvents(current => [...current, { phase: 'resources', status: 'running', message: 'Comparing retained combinations against pinned source manifests and current cluster resources.' }]);
                try {
                    const rendered = await api(`/api/agentic-deployments/${encodeURIComponent(result.id)}/select`, {
                        candidate_id: result.selected_candidate.id, render_resources: true, compare_combinations: true,
                    });
                    accept(rendered);
                    if (mounted.current) setEvents(current => [...current, { phase: 'resources', status: 'complete', message: 'Generated topology and YAML share the checked configuration. Runtime readiness and performance remain unverified.' }]);
                } catch (failure) {
                    if (mounted.current) setError(`The recommendation is preserved, but resource checks failed: ${failure.message}. Review the decision list and retry resource generation; deployment remains blocked.`);
                }
            }
        } catch (failure) {
            if (mounted.current) setError(controller.signal.aborted ? 'Planning cancelled. No deployment was started.' : failure.message);
        } finally { if (mounted.current) setBusy(false); abort.current = null; }
    };
    const mutate = async (action, body) => {
        setBusy(true); setError('');
        try {
            const value = await api(`/api/agentic-deployments/${encodeURIComponent(run.id)}/${action}`, body);
            accept(value);
            return value;
        } catch (failure) {
            if (mounted.current) setError(failure.message);
            throw failure;
        } finally { if (mounted.current) setBusy(false); }
    };
    const choose = async id => { try { await mutate('select', { candidate_id: id }); } catch { /* mutate presents the error. */ } };
    const render = async () => { try { await mutate('select', { candidate_id: run.selected_candidate.id, render_resources: true }); } catch { /* mutate presents the error. */ } };
    const edit = ({ node, patch }) => mutate('select', {
        candidate_id: run.selected_candidate.id, role: node.role === 'prefill' ? 'prefill' : 'decode',
        replicas: patch.replicas, tensor_parallel_size: patch.tensorParallelSize,
        max_model_len: patch.max_model_len, gpu_memory_utilization: patch.gpu_memory_utilization,
        max_num_seqs: patch.max_num_seqs, max_num_batched_tokens: patch.max_num_batched_tokens,
    });
    const deploy = async () => {
        try { const result = await mutate('approve', { configuration_checksum: reviewedChecksum }); if (result.deployment_run_id) onDeploymentStarted?.(); }
        catch { /* mutate presents the error. */ }
    };
    const reset = () => { sessionStorage.removeItem(key); setRun(null); setReviewedChecksum(''); setError(''); setEvents([]); };
    const plan = run?.configuration_plan;
    const manifest = plan?.configuration?.content?.officialGuide?.renderedManifest || '';
    const checked = Boolean(manifest) && plan?.validation?.status === 'resources_checked';
    const reviewed = checked && reviewedChecksum === plan?.configuration?.checksum;
    const locked = busy || active || !permitted || (run && run.status !== 'awaiting_approval');
    const stage = run?.deployment_run_id ? 3 : run ? 2 : busy ? 1 : 0;
    const stages = ['Deployment goals', mode === 'manual' ? 'Build plan' : 'Compare plans', 'Review and edit', 'Deploy and observe'];
    const content = <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold text-theme-text">{mode === 'manual' ? 'Manual deployment' : 'Agentic deployment'}</h2><p className="mt-1 text-sm text-theme-muted">{mode === 'manual' ? 'Build a compatible starting point, then make it yours.' : 'Set your goal. Compare recommendations before you commit resources.'}</p></div>
            {onBack && <Button variant="secondary" size="sm" disabled={busy || active || editing} onClick={onBack}><ArrowLeft size={14} />Change target</Button>}
        </div>
        <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Deployment workflow">
            {stages.map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined} className={cn('flex items-center gap-3 rounded-lg border border-theme-border p-3 text-xs', stage === index ? 'bg-theme-card font-semibold text-theme-text ring-1 ring-inset ring-current' : 'text-theme-muted')}>
                {index < stage ? <CheckCircle2 size={16} aria-label="Complete" /> : <Circle size={16} aria-label={stage === index ? 'Current' : 'Pending'} />}<span>{index + 1}. {label}</span>
            </li>)}
        </ol>
        {error && <Panel title="Action could not complete"><p role="alert" className="text-sm text-theme-text">{error}</p></Panel>}
        {!permitted && <EmptyState title="Deployment permission required" message="Ask an administrator for deployment-create access to this cluster." />}
        {restoring ? <LoadingState label="Restoring deployment plan" /> : !run && <DeploymentRequirementsForm mode={mode} initialValue={requirements} onSubmit={generate} disabled={busy || !permitted}>
            <label className="block text-sm">AI provider<Select className="mt-1" value={provider} onChange={event => setProvider(event.target.value)}>
                <option value="">Built-in planner (no external AI)</option>
                {providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select><span className="mt-2 block text-xs text-theme-muted">Optional. Select a provider to use AI-assisted proposals; otherwise Lens compares plans with built-in rules.</span></label>
        </DeploymentRequirementsForm>}
        {events.length > 0 && <Panel padding="sm"><details open={busy && !run}><summary className="cursor-pointer text-sm font-medium">{busy ? 'Building your deployment plan' : 'Planning activity'}<span className="ml-2 text-xs font-normal text-theme-muted">{events.length} updates</span></summary>
            {busy && <p role="status" className="mt-3 text-sm text-theme-muted">{events.at(-1)?.message}</p>}
            <ol className="mt-4 max-h-56 space-y-2 overflow-auto" aria-live="polite">
            {events.map((event, index) => <li key={index} className="flex items-start gap-2 text-sm"><Badge tone={event.status === 'complete' ? 'success' : 'neutral'}>{event.phase}</Badge><span>{event.message}</span></li>)}
        </ol></details>{busy && !run && <Button className="mt-3" variant="secondary" onClick={() => abort.current?.abort()}>Cancel planning</Button>}</Panel>}
        {run && <>
            <Panel title="Your deployment plan" tone="subtle" actions={<Badge tone={checked ? 'success' : 'neutral'}>{checked ? 'Resources checked' : 'Review required'}</Badge>}>
                <div className="grid gap-4 md:grid-cols-3">
                    <div><p className="text-xs text-theme-muted">Evidence</p><p className="mt-1 text-sm">{candidateEvidence(run)}</p></div>
                    <div><p className="text-xs text-theme-muted">Planned accelerators</p><p className="mt-1 text-sm">{plan?.resource_estimate?.accelerators ?? run.selected_candidate?.required_gpus ?? 'Calculated during resource checks'}</p></div>
                    <div><p className="text-xs text-theme-muted">Selection source</p><p className="mt-1 text-sm">{run.parent_run_id ? 'User revision; original plan preserved' : run.generator === 'ai-mcp' ? 'AI proposals with deterministic checks' : 'Deterministic rules'}</p></div>
                </div>
                <p className="mt-4 text-sm text-theme-muted">{run.decision?.rationale || 'User-modified configuration. Prior performance evidence does not validate this revision.'}</p>
                {run.generator_fallback_reason && <p className="mt-2 text-sm text-theme-muted">AI generation fallback: {run.generator_fallback_reason}. The displayed plan was generated deterministically.</p>}
                {run.planner_fallback_reason && <p className="mt-2 text-sm text-theme-muted">AI comparison fallback: {run.planner_fallback_reason}.</p>}
            </Panel>
            <DeploymentPlanReview content={manifest} candidate={run.selected_candidate} model={draft.model} mode={mode} decisions={plan?.decisions || []} onEdit={edit} onEditingChange={setEditing} disabled={locked} validation={plan?.validation} revision={run.revision} runtime={run.request} maxAccelerators={plan?.requirements?.hard_constraints?.maxAccelerators} />
            <Panel padding="sm"><details open={mode === 'agentic'}><summary className="cursor-pointer text-sm font-semibold">{mode === 'manual' ? 'Compare compatible alternatives' : 'Candidate comparison'} <span className="font-normal text-theme-muted">({run.candidates.length})</span></summary>
                <p className="my-3 text-xs text-theme-muted">Changing a candidate replaces the working plan. Generate and check its resources before approval.</p>
                <fieldset disabled={locked || editing} className="min-w-0 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-theme-border text-theme-muted"><th className="p-2">Provider recipe</th><th className="p-2">Accelerators</th><th className="p-2">Target evidence</th><th className="p-2">Selection</th></tr></thead><tbody>
                    {run.candidates.map(item => <tr key={item.id} className="border-b border-theme-border"><td className="p-2">{item.provider_ref}{item.native_cpu_cache_gib ? ` + CPU KV cache (${item.native_cpu_cache_gib} GiB / serving replica)` : ''}<p className="text-xs text-theme-muted">{item.replicas} replicas / TP {item.tensor_parallel_size}{item.prefill_replicas ? `; prefill ${item.prefill_replicas} / TP ${item.prefill_tensor_parallel_size}` : ''}</p></td><td className="p-2">{item.required_gpus}</td><td className="p-2">{item.slo_status === 'satisfied' ? 'Prediction / historical support; not verified here' : item.slo_status === 'not_satisfied' ? 'Targets not met by available evidence' : 'Not benchmarked for your targets'}</td><td className="p-2"><Button size="sm" variant={run.selected_candidate.id === item.id ? 'primary' : 'secondary'} disabled={locked || run.selected_candidate.id === item.id} onClick={() => choose(item.id)}>{run.selected_candidate.id === item.id ? 'Selected' : 'Review alternative'}</Button></td></tr>)}
                </tbody></table></fieldset>
                {run.rejected_candidates?.length > 0 && <details className="mt-3 text-sm"><summary>Excluded candidates ({run.rejected_candidates.length})</summary><ul className="mt-2 space-y-2">{run.rejected_candidates.map(item => <li key={item.id}>{item.provider_ref}: {item.rejection_reasons.join('; ')}</li>)}</ul></details>}
            </details></Panel>
            <Panel title={run.deployment_run_id ? 'Deployment submitted' : 'Ready to deploy?'} actions={<Badge tone={reviewed || run.deployment_run_id ? 'success' : 'warning'}>{run.status.replaceAll('_', ' ')}</Badge>}>
                <p className="mb-4 text-sm text-theme-muted">{run.deployment_run_id ? 'Deployment has been submitted. Open Deployments to follow readiness and inspect logs.' : !checked ? 'Next: generate the deployment resources and run compatibility checks. Nothing will be installed yet.' : !reviewed ? 'Next: review the topology, YAML and checks, then confirm this configuration version.' : 'Your review is recorded. Approval will deploy this exact version using current cluster capacity.'}</p>
                <details><summary className="mb-3 cursor-pointer text-sm font-medium">Resource checks and remaining validation</summary>
                <div className="grid gap-4 md:grid-cols-2"><div><h3 className="text-sm font-semibold">Completed checks</h3><ul className="mt-2 space-y-1 text-sm text-theme-muted">{(plan?.validation?.checks || []).map(check => <li key={check}>{check}</li>)}</ul></div><div><h3 className="text-sm font-semibold">Still pending</h3><ul className="mt-2 space-y-1 text-sm text-theme-muted">{(plan?.validation?.pending || ['Regenerate this legacy plan']).map(check => <li key={check}>{check}</li>)}</ul></div></div>
                </details>
                {plan?.validation?.warnings?.map(warning => <p key={warning} className="mt-2 text-sm">{warning}</p>)}
                <p className="mt-4 text-xs text-theme-muted">Generated YAML is not proof of admission, readiness or performance. Approval rechecks current capacity and deploys this reviewed manifest. Deployment may still fail; observe its run status.</p>
                {editing && <p role="status" className="mt-3 text-sm text-theme-muted">Apply or cancel the component edit before changing the plan or approving deployment.</p>}
                <fieldset disabled={editing} className="mt-4 flex flex-wrap justify-end gap-2">
                    {!run.deployment_run_id && <>
                        <Button variant="secondary" disabled={locked} onClick={reset}>Change requirements</Button>
                        {!checked && <Button disabled={locked || !plan} onClick={render} isLoading={busy}>Generate and check YAML</Button>}
                        {checked && !reviewed && <Button disabled={locked} onClick={() => setReviewedChecksum(plan.configuration.checksum)}>Confirm configuration review</Button>}
                        {checked && reviewed && <Button disabled={locked} onClick={deploy} isLoading={busy}>Approve and deploy reviewed version</Button>}
                    </>}
                    {run.deployment_run_id && <Button variant="secondary" onClick={onDeploymentStarted}>Observe deployment</Button>}
                </fieldset>
            </Panel>
            {mode === 'agentic' && (run.request.execution_policy.allow_trials || run.optimization) && <MeasuredOptimizationControls key={run.id} run={run} onUpdate={accept} onReview={choose} disabled={busy || !permitted || editing} />}
        </>}
    </section>;
    return embedded ? content : <ModulePage>{content}</ModulePage>;
}

export default function AgenticDeploymentWorkspace(props) {
    return <DeploymentWorkflow {...props} mode="agentic" />;
}
