import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Badge, Button, Input, Panel, Textarea } from '../../../shared/ui';
import { DEFAULT_REQUIREMENTS } from '../api/agenticDeploymentBackend';

export function DeploymentRequirementsForm({ mode = 'manual', initialValue, onSubmit, disabled = false, runtime, resourceEstimate, children }) {
    const [value, setValue] = useState({ ...DEFAULT_REQUIREMENTS, ...initialValue });
    const patch = key => event => setValue(current => ({ ...current, [key]: event.target.value }));
    const number = (key, label, placeholder, max) => <label className="block text-sm text-theme-text">{label}
        <Input className="mt-1.5" type="number" min={key === 'requestRate' ? '0.01' : '1'} step={key === 'requestRate' ? 'any' : '1'} max={max} value={value[key]} placeholder={placeholder} onChange={patch(key)} />
    </label>;
    return <form onInvalid={event => event.target.closest('details')?.setAttribute('open', '')} onSubmit={event => { event.preventDefault(); onSubmit(value); }}>
        <Panel title={mode === 'manual' ? 'Workload and limits' : 'Deployment goals'} actions={<Badge tone="info">Optional overrides</Badge>}>
            <fieldset disabled={disabled} className="space-y-5">
                <p className="text-sm text-theme-muted">{mode === 'manual'
                    ? 'Default: combine all compatible optimizations within discovered capacity. Traffic is not required to enable caching.'
                    : 'Set only the limits you know, or build a rule-based recommendation with the defaults. AI assistance is optional.'}</p>
                {(runtime?.max_model_len || resourceEstimate?.available_accelerators != null) && <p className="text-xs text-theme-muted">
                    {runtime?.max_model_len ? `Context ${runtime.max_model_len.toLocaleString()} tokens` : ''}
                    {runtime?.max_model_len && resourceEstimate?.available_accelerators != null ? ' · ' : ''}
                    {resourceEstimate?.available_accelerators != null ? `${resourceEstimate.available_accelerators} accelerators available` : ''}
                </p>}
                <div className="grid items-start gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                        {number('maxAccelerators', 'Accelerator limit', 'Use available capacity')}
                        <p className="text-xs text-theme-muted">Changes which combinations fit, including separate prefill / decode.</p>
                    </div>
                    <div className="space-y-2">
                        {number('concurrency', 'Concurrent requests', 'Unconstrained')}
                        <p className="text-xs text-theme-muted">Refines capacity estimates. Use this or QPS, not both.</p>
                    </div>
                    <div className="space-y-2">
                        {number('requestRate', 'Request rate (QPS)', 'Unconstrained')}
                        <p className="text-xs text-theme-muted">Sets the throughput target; does not switch optimizations on or off.</p>
                    </div>
                </div>
                <details open={Boolean(initialValue?.inputTokens || initialValue?.outputTokens || initialValue?.p95InputTokens)}>
                    <summary className="cursor-pointer text-sm font-medium">Request size <span className="font-normal text-theme-muted">/ refine KV memory estimates</span></summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-3">
                        {number('inputTokens', 'Mean input tokens', 'Optional estimate')}
                        {number('outputTokens', 'Mean output tokens', 'Optional estimate')}
                        {number('p95InputTokens', 'P95 input tokens', 'Optional estimate')}
                    </div>
                </details>
                {mode === 'agentic' && <details open={Boolean(initialValue?.plannerPrompt)}>
                    <summary className="cursor-pointer text-sm font-medium">AI assistance <span className="font-normal text-theme-muted">/ optional</span></summary>
                    <div className="mt-3 space-y-4">
                        {children}
                        <label className="block text-sm">Goal for the AI planner (optional)
                            <Textarea className="mt-1.5" value={value.plannerPrompt} maxLength={1800} onChange={patch('plannerPrompt')} placeholder="For example: serve document analysis with short responses." />
                        </label>
                        <p className="text-sm text-theme-muted">A written goal requires an AI provider. Numeric limits must still be entered explicitly above.</p>
                    </div>
                </details>}
                <details open={Boolean(initialValue?.ttftMs || initialValue?.tpotMs || initialValue?.e2eMs)}>
                    <summary className="cursor-pointer text-sm font-medium">Latency targets <span className="font-normal text-theme-muted">/ compare predicted or measured results</span></summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-3">
                        {number('ttftMs', 'P95 TTFT (ms)', 'Unconstrained')}
                        {number('tpotMs', 'P95 TPOT (ms)', 'Unconstrained')}
                        {number('e2eMs', 'P95 E2E (ms)', 'Unconstrained')}
                    </div>
                    <p className="mt-2 text-xs text-theme-muted">TTFT: first token. TPOT: each output token. E2E: full response. Targets need a benchmark to be verified.</p>
                </details>
                {value.providerRef && <p role="status" className="text-sm">This saved plan pins a deployment method. <Button size="xs" variant="link" onClick={() => setValue(current => ({ ...current, providerRef: '' }))}>Remove method restriction</Button></p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-4">
                    <p className="text-xs text-theme-muted">Rebuild applies these overrides. No live deployment is changed.</p>
                    <Button type="submit" isLoading={disabled} disabled={disabled}>{runtime ? 'Rebuild plan' : 'Build deployment plan'}<ArrowRight size={15} /></Button>
                </div>
            </fieldset>
        </Panel>
    </form>;
}
