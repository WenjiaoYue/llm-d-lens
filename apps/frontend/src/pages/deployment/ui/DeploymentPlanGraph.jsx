import { useId, useState } from 'react';
import { ArrowRight, Focus, Pencil, Power, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { edgeGeometry, layoutPlan, OPTIMIZATION_STATES } from '../model/deploymentPlan';
import { Badge, Button, Input, Panel } from '../../../shared/ui';
import { cn } from '../../../shared/lib/cn';
import { CHART_SERIES } from '../../../shared/ui/charts/palette';

export function DeploymentPlanGraph({ plan, selected, onSelect, onEdit, onToggle, disabled = false }) {
    const [zoom, setZoom] = useState(1), [query, setQuery] = useState(''), [edgeIndex, setEdgeIndex] = useState(null), [hovered, setHovered] = useState(null);
    const edge = plan.edges[edgeIndex];
    const marker = useId().replaceAll(':', '');
    const nodes = layoutPlan(plan), height = Math.max(250, ...nodes.map(n => n.y + n.height / 2 + 28));
    const width = Math.max(900, ...nodes.map(n => n.x + n.width / 2 + 32));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const focused = hovered || (byId.has(selected) ? selected : null);
    const connected = new Set(focused ? [focused, ...plan.edges.filter(item => [item.from, item.to].includes(focused)).flatMap(item => [item.from, item.to])] : []);
    const reset = () => { setZoom(1); setQuery(''); setEdgeIndex(null); onSelect(''); };
    return <Panel padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-theme-border px-4 py-3">
            <div className="mr-auto"><p className="text-sm font-semibold">{plan.optimization ? 'Inference flow' : 'Resource map'}</p><p className="text-xs text-theme-muted">{plan.serving || 'Declared resource relationships'}</p></div>
            <div className="w-44"><Input variant="toolbar" icon={Search} type="search" aria-label="Find topology component" placeholder="Find a node" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <Button size="icon" variant="ghost" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom(value => value - 0.25)}><ZoomOut size={15} /></Button>
            <Button size="icon" variant="ghost" title="Fit view" aria-label="Fit view" onClick={() => setZoom(1)}><Focus size={15} /></Button>
            <Button size="icon" variant="ghost" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(value => value + 0.25)}><ZoomIn size={15} /></Button>
            <Button size="icon" variant="ghost" title="Clear selection" aria-label="Clear selection" onClick={reset}><RotateCcw size={15} /></Button>
        </div>
        {query && <div className="flex flex-wrap gap-2 p-3" aria-label="Matching components">{nodes.filter(node => `${node.name} ${node.kind}`.toLowerCase().includes(query.toLowerCase())).map(node => <Button key={node.id} size="xs" variant="secondary" onClick={() => onSelect(node.id)}>{node.name}</Button>)}{!nodes.some(node => `${node.name} ${node.kind}`.toLowerCase().includes(query.toLowerCase())) && <p className="text-xs text-theme-muted">No matching nodes.</p>}</div>}
        <div className="max-h-[44rem] overflow-auto bg-theme-bg">
            <svg role="group" aria-label="Deployment resource relationships" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 960 * zoom, width: `${100 * zoom}%` }}>
                <defs>{['flow', 'attachment', 'dependency'].map((kind, index) => <marker key={kind} id={`${marker}-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={CHART_SERIES[index]} /></marker>)}</defs>
                {plan.optimization && <><text x="32" y="30" fontSize="12" fill="var(--text-muted)">REQUEST PATH</text><text x="32" y="242" fontSize="12" fill="var(--text-muted)">OPTIMIZATIONS</text></>}
                {plan.edges.map((item, index) => {
                    const geometry = edgeGeometry(item, nodes);
                    if (!geometry) return null;
                    const kind = item.kind || 'attachment', color = CHART_SERIES[{ flow: 0, attachment: 1, dependency: 2 }[kind]];
                    const active = edgeIndex === index || (focused && [item.from, item.to].includes(focused));
                    const choose = () => setEdgeIndex(edgeIndex === index ? null : index);
                    return <g key={index} role="button" tabIndex={0} aria-label={`${byId.get(item.from).name}: ${item.label} → ${byId.get(item.to).name}`} aria-pressed={edgeIndex === index} onClick={choose} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); choose(); } }} opacity={focused && !active ? 0.2 : 1} style={{ cursor: 'pointer' }}>
                        <path d={geometry.path} fill="none" stroke="transparent" strokeWidth="16" />
                        <path d={geometry.path} fill="none" stroke={color} strokeWidth={active ? 3.5 : 2.2} strokeDasharray={kind === 'dependency' || item.pending ? '6 4' : undefined} markerEnd={`url(#${marker}-${kind})`} />
                        {kind === 'flow' && <text x={geometry.labelX} y={byId.get(item.from).y - 60} textAnchor="middle" fontSize="12" fill="var(--text-primary)">{item.label}</text>}
                        <title>{item.label}</title>
                    </g>;
                })}
                {nodes.map(node => {
                    const status = OPTIMIZATION_STATES[node.status];
                    const inactive = node.capability && !['enabled', 'dependency', 'unknown'].includes(node.status);
                    const name = `${node.kind}: ${node.name}`;
                    const enabled = node.enabled ?? ['enabled', 'dependency'].includes(node.status);
                    const toggleLabel = `${enabled ? 'Disable' : 'Enable'} ${node.name}`;
                    return <g key={node.id} role="group" aria-label={name} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} opacity={focused && !connected.has(node.id) ? 0.45 : 1}>
                        <foreignObject x={node.x - node.width / 2} y={node.y - node.height / 2} width={node.width} height={node.height}>
                            <Panel padding="sm" className={cn('h-full', inactive && 'border-dashed', selected === node.id && 'ring-2 ring-inset ring-[var(--brand-accent)]')}>
                                <Button variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal px-0 py-0 text-left text-sm" title={node.detail} aria-label={name} aria-pressed={selected === node.id} onClick={() => { setEdgeIndex(null); onSelect(selected === node.id ? '' : node.id); }}>{node.name}</Button>
                                {node.capability ? <div className="mt-3 flex items-center gap-1">
                                    <Badge tone={status?.tone || 'neutral'}>{status?.label || node.status}</Badge>
                                    <span className="ml-auto" />
                                    {onEdit && <Button size="icon" variant="ghost" title={`Edit ${node.name}`} aria-label={`Edit ${node.name}`} disabled={disabled || node.editDisabled || node.status === 'unsupported'} onClick={() => onEdit(node.capability)}><Pencil size={14} /></Button>}
                                    {onToggle && <Button size="icon" variant="ghost" title={toggleLabel} aria-label={toggleLabel} aria-pressed={enabled} disabled={disabled || node.toggleDisabled || node.status === 'unsupported'} onClick={() => onToggle(node.capability, enabled)}><Power size={15} /></Button>}
                                </div> : <p className="mt-2 text-xs text-theme-muted">{node.detail}</p>}
                            </Panel>
                        </foreignObject>
                    </g>;
                })}
            </svg>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-theme-border px-4 py-2 text-xs text-theme-muted" aria-label="Relationship legend">
            {(plan.optimization ? [['Request / KV flow', 0, false], ['Optimization applies to stage', 1, false], ['Required dependency', 2, true]] : [['Resource reference', 1, false]]).map(([label, color, dashed]) => <span key={label} className="inline-flex items-center gap-2"><svg width="30" height="10" aria-hidden="true"><path d="M0 5 H26 L22 1 M26 5 L22 9" fill="none" stroke={CHART_SERIES[color]} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} /></svg>{label}</span>)}
            <span className="ml-auto">Select a node to trace its connections</span>
        </div>
        {edge && <aside className="flex flex-wrap items-center gap-2 border-t border-theme-border px-4 py-3 text-sm" aria-label="Relationship details"><strong>{byId.get(edge.from)?.name}</strong><ArrowRight size={14} /><strong>{byId.get(edge.to)?.name}</strong><Badge tone="info">{edge.label}</Badge></aside>}
    </Panel>;
}
