import { useId } from 'react';
import { layoutPlan } from '../model/deploymentPlan';
import { CHART_SERIES } from '../../../shared/ui/charts/palette';

export function DeploymentPlanGraph({ plan, selected, onSelect }) {
    const marker = useId().replaceAll(':', '');
    const nodes = layoutPlan(plan), height = Math.max(250, ...nodes.map(n => n.y + 80));
    const byId = new Map(nodes.map(n => [n.id, n]));
    return <div className="overflow-auto rounded-lg border border-theme-border bg-theme-bg"><svg role="group" aria-label="Deployment resource relationships" viewBox={`0 0 940 ${height}`} style={{ minWidth: 700, width: '100%' }}>
        <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {plan.edges.map((edge, i) => { const a = byId.get(edge.from), b = byId.get(edge.to); if (!a || !b) return null; const direction = Math.sign(b.x - a.x) || 1, ax = a.x + direction * 115, bx = b.x - direction * 115; return <g key={i} className="text-theme-muted"><path d={`M ${ax} ${a.y} C ${(ax + bx) / 2} ${a.y}, ${(ax + bx) / 2} ${b.y}, ${bx} ${b.y}`} fill="none" stroke="currentColor" markerEnd={`url(#${marker})`} opacity="0.5" /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} textAnchor="middle" fontSize="11" fill="currentColor">{edge.label}</text></g>; })}
        {nodes.map(node => <g key={node.id} role="button" tabIndex={0} aria-label={`${node.kind}: ${node.name}`} aria-pressed={selected === node.id} onClick={() => onSelect(node.id)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(node.id); } }} style={{ cursor: 'pointer' }}>
            <rect x={node.x - 115} y={node.y - 30} width="230" height="70" rx="8" fill="var(--bg-card)" stroke={CHART_SERIES[node.tier]} strokeWidth={selected === node.id ? 3 : 1} />
            <text x={node.x} y={node.y - 9} textAnchor="middle" fontSize="11" fill={CHART_SERIES[node.tier]}>{node.kind}</text><text x={node.x} y={node.y + 12} textAnchor="middle" fontSize="12" fill="var(--text-primary)">{node.name.length > 28 ? `${node.name.slice(0, 25)}…` : node.name}</text><title>{`${node.name}: ${node.detail}`}</title>
        </g>)}
    </svg></div>;
}
