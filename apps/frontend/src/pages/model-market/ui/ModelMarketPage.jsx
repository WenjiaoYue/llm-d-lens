import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Database, Rocket, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { CATEGORIES, MODELS } from '@repo/shared/catalog';
import { requestJson } from '../../../shared/api/httpClient';
import { usePolling } from '../../../shared/lib/usePolling';
import { Badge, Button, EmptyState, Input, ModuleHeader, ModulePage, Panel, Select, StorageVolumeSelect } from '../../../shared/ui';
import { FormError } from '../../../shared/ui/FormError';
import { listStorageVolumes } from '../../storage';
import { listModelCacheEntries } from '../../model-cache';
import { AgenticDeploymentWorkspace, ManualDeploymentWorkspace } from '../../deployment';
import { useAuth } from '../../auth';
import { consumePendingModelMarketCluster } from '../model/transfer';
import { standardRecommendation } from '../model/standardRecommendation';

function deploymentName(model) {
    const suffix = crypto.randomUUID().slice(0, 8);
    return `${String(model.id || 'model').slice(0, 54)}-${suffix}`;
}

export function ModelCard({ model, onSelect }) {
    return (
        <Button type="button" variant="catalogCard" onClick={() => onSelect(model)}
            className="group flex h-auto min-h-52 flex-col items-stretch justify-start gap-0 whitespace-normal rounded-lg p-5 text-left font-normal">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-medium uppercase text-[var(--brand-accent)] dark:text-cyan-300">{model.family}</p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{model.name}</h2>
                </div>
                <Box size={19} className="shrink-0 text-[var(--brand-accent)] transition dark:text-slate-500 dark:group-hover:text-cyan-300" aria-hidden="true" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 text-xs">
                <div><dt className="text-slate-500">Released</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{model.releaseDate}</dd></div>
                <div><dt className="text-slate-500">Precision</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{model.dtype}</dd></div>
                <div><dt className="text-slate-500">Weights</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{model.weightGiB ? `${model.weightGiB} GiB` : 'Not listed'}</dd></div>
                <div><dt className="text-slate-500">Context</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{model.contextLength ? model.contextLength.toLocaleString() : 'Not listed'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">Model type</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{model.modelType}</dd></div>
            </dl>
        </Button>
    );
}

export default function ModelMarketPage({ onNavigate, isActive = true }) {
    const { can } = useAuth();
    const [selected, setSelected] = useState(() => {
        const saved = sessionStorage.getItem('prism_model_market_return_draft');
        if (!saved) return null;
        try { return MODELS.find(model => model.repository === JSON.parse(saved)?.model) || null; }
        catch { return null; }
    });
    const [category, setCategory] = useState('All'), [search, setSearch] = useState('');
    const [name, setName] = useState(''), [description, setDescription] = useState('');
    const [cluster, setCluster] = useState(''), [clusters, setClusters] = useState([]);
    const [storage, setStorage] = useState(''), [volumes, setVolumes] = useState([]);
    const [loadingStorage, setLoadingStorage] = useState(false), [cacheReady, setCacheReady] = useState(false);
    const [checkingCache, setCheckingCache] = useState(false), [error, setError] = useState('');
    const [mode, setMode] = useState('manual'), [draft, setDraft] = useState(null);
    const [pendingCluster] = useState(() => consumePendingModelMarketCluster());
    const [hardware, setHardware] = useState(null);
    const cacheRequest = useRef(0);
    useEffect(() => {
        if (!selected) return;
        const saved = sessionStorage.getItem('prism_model_market_return_draft_values');
        sessionStorage.removeItem('prism_model_market_return_draft');
        sessionStorage.removeItem('prism_model_market_return_draft_values');
        if (!saved) { setName(deploymentName(selected)); return; }
        try {
            const values = JSON.parse(saved);
            setName(values.deployName || deploymentName(selected));
            setDescription(values.description || '');
            setCluster(values.cluster || '');
        } catch { setError('The saved model draft could not be restored. Choose deployment requirements again.'); }
    }, [selected]);
    const loadClusters = useCallback(async () => {
        try {
            const payload = await requestJson('/api/cluster/clusters');
            const items = payload.items || [];
            setClusters(items);
            setCluster(current => current || (items.some(item => item.id === pendingCluster) ? pendingCluster : items.find(item => item.ready)?.id) || '');
        } catch (failure) { setError(failure.message); }
    }, [pendingCluster]);
    useEffect(() => { if (isActive) loadClusters(); }, [loadClusters, isActive]);
    usePolling(loadClusters, { enabled: isActive });
    useEffect(() => {
        let active = true;
        setHardware(null); setVolumes([]); setStorage(''); setCacheReady(false);
        if (!cluster || !isActive) return undefined;
        setLoadingStorage(true);
        requestJson(`/api/cluster/overview?clusterId=${encodeURIComponent(cluster)}`)
            .then(overview => { if (active) setHardware(overview.kubernetes?.hardware || null); })
            .catch(failure => { if (active) setError(failure.message); });
        listStorageVolumes({ clusterId: cluster, purpose: 'model-cache' }).then(items => {
            if (!active) return;
            setVolumes(items);
            setStorage(items.find(item => item.status === 'ready')?.id || '');
        }).catch(failure => { if (active) setError(failure.message); })
            .finally(() => { if (active) setLoadingStorage(false); });
        return () => { active = false; };
    }, [cluster, isActive]);
    const checkCache = useCallback(async () => {
        const request = ++cacheRequest.current;
        if (!selected || !storage || !cluster) { setCacheReady(false); return; }
        setCheckingCache(true);
        try {
            const entries = await listModelCacheEntries({ clusterId: cluster, storageVolumeId: storage });
            if (request === cacheRequest.current) setCacheReady(entries.some(entry => entry.status === 'ready' && entry.source?.kind === 'huggingface' && String(entry.source.huggingface.repoId || '').toLowerCase() === selected.repository.toLowerCase()));
        } catch (failure) { if (request === cacheRequest.current) { setCacheReady(false); setError(failure.message); } }
        finally { if (request === cacheRequest.current) setCheckingCache(false); }
    }, [selected, storage, cluster]);
    useEffect(() => { setCacheReady(false); if (isActive) checkCache(); return () => { cacheRequest.current += 1; }; }, [checkCache, isActive]);
    usePolling(checkCache, { enabled: isActive && Boolean(selected && storage && cluster), intervalMs: 10000 });
    const choose = model => { setSelected(model); setDescription(''); setDraft(null); setMode('manual'); setError(''); };
    const begin = event => {
        event.preventDefault(); setError('');
        if (!cacheReady) { setError('The selected model must be ready in the selected model cache.'); return; }
        const defaults = standardRecommendation(selected, hardware);
        setDraft({
            model: selected.repository, modelTitle: selected.name, modelWeightGiB: selected.weightGiB || selected.sizeGiB,
            deploymentName: name, description, clusterId: cluster, clusterName: clusters.find(item => item.id === cluster)?.name, storageVolumeId: storage, storageVolumeName: volumes.find(item => item.id === storage)?.name,
            contextLength: defaults.maxModelLen, gpuMemoryUtilization: 0.9,
            maxNumSeqs: 256, maxNumBatchedTokens: 8192, vllmArguments: selected.vllmArguments || [],
        });
    };
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const models = MODELS.filter(model => (category === 'All' || model.category === category) && words.every(word => [model.name, model.family, model.repository, model.modelType, model.category, model.dtype].some(value => String(value || '').toLowerCase().includes(word))));
    if (!selected) return <ModulePage contentClassName="flex flex-col gap-4 py-4 lg:py-5">
        <ModuleHeader icon={Database} title="Model Catalog" />
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 w-full flex-wrap gap-2 lg:w-auto lg:flex-1" role="tablist" aria-label="Model categories">{CATEGORIES.map(item => <Button type="button" key={item} role="tab" size="sm" variant="catalogTab" className="h-auto rounded-md px-3 py-1.5 font-normal" aria-selected={category === item} onClick={() => setCategory(item)}>{item}</Button>)}</div>
            <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
                <span role="status" className="text-xs text-theme-muted">{models.length} models</span>
                <div className="w-52 sm:w-64">
                    <Input type="search" icon={Search} aria-label="Search models" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search models, publishers, repositories, types, or precision..." />
                </div>
                {(search || category !== 'All') && <Button type="button" size="sm" variant="secondary" onClick={() => { setSearch(''); setCategory('All'); }}>Clear filters</Button>}
            </div>
        </div>
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{models.map(model => <ModelCard key={model.id} model={model} onSelect={choose} />)}{!models.length && <EmptyState className="col-span-full" icon={<Search size={22} aria-hidden="true" />} title="No matching models" message="Try another search or change the model category." />}</section>
    </ModulePage>;
    const allowed = can('deployment:run:create');
    const Workspace = mode === 'manual' ? ManualDeploymentWorkspace : AgenticDeploymentWorkspace;
    return <ModulePage contentClassName="flex flex-col gap-5">
        <ModuleHeader icon={Rocket} title="Create deployment" />
        {!draft && <Button className="self-start" variant="ghost" onClick={() => { setSelected(null); setDraft(null); }}><ArrowLeft size={15} />Model Catalog</Button>}
        {!allowed ? <EmptyState title="Your role cannot create deployments" message="Use an existing deployment or request deployment-create permission." action={<Button onClick={() => onNavigate('optimization-deployments')}>Open Deployments</Button>} /> : draft ? <>
            <Workspace key={`${mode}:${draft.clusterId}:${draft.model}:${draft.deploymentName}`} embedded draft={draft} onBack={() => setDraft(null)} onDeploymentStarted={run => onNavigate('optimization-deployments', { clusterId: draft.clusterId, deploymentSearch: run?.deployment_execution_id || run?.deployment_run_id || draft.deploymentName })} />
        </> : <form onSubmit={begin} className="space-y-5">
            <Panel title="Deployment target" actions={<Badge tone="neutral">{selected.family}</Badge>}>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="mb-5 mt-1 break-all text-sm text-theme-muted">{selected.repository}</p>
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm">Cluster<Select className="mt-1" required value={cluster} onChange={event => setCluster(event.target.value)}><option value="">Select cluster</option>{clusters.map(item => <option key={item.id} value={item.id} disabled={!item.ready}>{item.name}{item.ready ? '' : ' (not ready)'}</option>)}</Select></label>
                    <label className="block text-sm">Deployment name
                        <Input className="mt-1" required value={name} onChange={event => setName(event.target.value)} />
                    </label>
                </div>
                <div className="mt-6 border-t border-theme-border pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold">Model files</h3>
                            <p role="status" className="mt-1 text-sm text-theme-muted">{!cluster ? 'Choose a cluster to check model availability.' : loadingStorage || (checkingCache && !cacheReady) ? 'Checking model availability...' : cacheReady ? 'Ready in the selected model cache.' : 'This model needs a ready cache before you can build a plan.'}</p>
                        </div>
                        <Button type="button" size="sm" variant="secondary" disabled={!cluster} onClick={() => onNavigate('model-cache', { downloadModel: { clusterId: cluster, repoId: selected.repository, storageVolumeId: storage } })}>{cacheReady ? 'Manage model cache' : 'Prepare model files'}</Button>
                    </div>
                    <details className="mt-3" open={!cacheReady}>
                        <summary className="cursor-pointer text-sm text-theme-muted">{cacheReady ? `Cache: ${volumes.find(item => item.id === storage)?.name || storage} / Change` : 'Choose model cache'}</summary>
                        <label className="mt-3 block max-w-xl text-sm">Model cache storage<StorageVolumeSelect className="mt-1" value={storage} onChange={setStorage} volumes={volumes} loading={loadingStorage} disabled={!cluster} placeholder="Select ready model storage" /></label>
                    </details>
                </div>
            </Panel>
            <Panel title="Planning strategy">
                <div className="grid gap-3 md:grid-cols-2">{[
                    ['manual', 'Compatible optimizations', 'Manual', 'Combine supported optimizations within available resources. Review and adjust the plan without an AI provider.', <SlidersHorizontal key="manual" size={18} />],
                    ['agentic', 'Goal-based recommendation', 'Agentic', 'Compare plans for your workload and limits. AI assistance and benchmark trials are optional.', <Sparkles key="agentic" size={18} />],
                ].map(([id, label, technical, detail, icon]) => <Button type="button" key={id} variant={mode === id ? 'secondary' : 'outline'} size="md" className="h-auto flex-col items-start gap-3 whitespace-normal p-5 text-left" aria-pressed={mode === id} onClick={() => setMode(id)}><span className="flex w-full flex-wrap items-center gap-2 font-semibold">{icon}{label}{mode === id && <Badge className="ml-auto" tone="info">Selected</Badge>}</span><span className="text-sm font-normal leading-relaxed">{detail}</span><span className="text-xs text-theme-muted">{technical}</span></Button>)}</div>
                <p className="mt-4 text-sm text-theme-muted">Both strategies produce an editable plan. Nothing deploys without your confirmation.</p>
            </Panel>
            <FormError message={error} />
            {!selected.vllmSupported && <p role="alert">This model requires a runtime not supported by this workflow.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-4"><p className="text-sm text-theme-muted">{cacheReady ? 'Next: review a plan before using cluster resources.' : 'Prepare the model files to continue.'}</p><Button type="submit" size="md" disabled={!cluster || !name || !cacheReady || checkingCache || !selected.vllmSupported}>{mode === 'manual' ? 'Build deployment plan' : 'Continue to deployment goals'}<ArrowRight size={15} /></Button></div>
        </form>}
    </ModulePage>;
}
