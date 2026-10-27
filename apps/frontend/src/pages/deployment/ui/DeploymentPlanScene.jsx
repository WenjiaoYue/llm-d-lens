import { useEffect, useRef, useState } from 'react';
import { CHART_SERIES } from '../../../shared/ui/charts/palette';

/** Optional Three.js projection of the same graph. Selection never mutates configuration. */
export default function DeploymentPlanScene({ plan, selected, onSelect }) {
    const host = useRef(null), callback = useRef(onSelect);
    callback.current = onSelect;
    const selection = useRef(selected), highlight = useRef(null);
    selection.current = selected;
    useEffect(() => { highlight.current?.(); }, [selected]);
    const [error, setError] = useState('');
    useEffect(() => {
        let disposed = false, cleanup = () => {};
        setError('');
        Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(([T, { OrbitControls }]) => {
            if (disposed) return;
            const element = host.current, renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            element.appendChild(renderer.domElement);
            const scene = new T.Scene(), camera = new T.PerspectiveCamera(45, 1, 0.1, 2000);
            const columns = Math.max(1, ...[0, 1, 2].map(t => plan.nodes.filter(n => n.tier === t).length));
            camera.position.set(12, 15, Math.max(20, columns * 4));
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.target.set(0, 2, 0); controls.update();
            scene.add(new T.HemisphereLight(CHART_SERIES[0], CHART_SERIES[2], 2));
            const labels = [];
            const objects = [], positions = new Map(), counts = [0, 0, 0];
            for (const node of plan.nodes) {
                const size = plan.nodes.filter(n => n.tier === node.tier).length;
                const x = (counts[node.tier]++ - (size - 1) / 2) * 4;
                const position = new T.Vector3(x, (2 - node.tier) * 4, 0);
                const mesh = new T.Mesh(new T.BoxGeometry(2.8, 0.8, 2), new T.MeshStandardMaterial({ color: CHART_SERIES[node.tier], emissive: CHART_SERIES[node.tier], emissiveIntensity: node.id === selection.current ? 0.5 : 0 }));
                const label = document.createElement('span');
                label.textContent = node.name;
                label.className = 'absolute pointer-events-none text-xs text-theme-text bg-theme-card rounded px-1 max-w-40 truncate';
                label.style.transform = 'translate(-50%, -100%)';
                element.appendChild(label); labels.push({ element: label, position: position.clone().add(new T.Vector3(0, 1, 0)) });
                mesh.position.copy(position); mesh.userData.id = node.id; scene.add(mesh); objects.push(mesh); positions.set(node.id, position);
            }
            for (const edge of plan.edges) if (positions.has(edge.from) && positions.has(edge.to)) scene.add(new T.Line(new T.BufferGeometry().setFromPoints([positions.get(edge.from), positions.get(edge.to)]), new T.LineBasicMaterial({ color: CHART_SERIES[1], transparent: true, opacity: 0.5 })));
            const draw = () => { if (disposed || document.hidden) return; renderer.render(scene, camera);
                for (const label of labels) { const point = label.position.clone().project(camera); label.element.style.left = `${(point.x + 1) / 2 * element.clientWidth}px`; label.element.style.top = `${(1 - point.y) / 2 * 380}px`; label.element.hidden = point.z < -1 || point.z > 1; }
            };
            highlight.current = () => { objects.forEach(mesh => { mesh.material.emissiveIntensity = mesh.userData.id === selection.current ? 0.5 : 0; }); draw(); };
            const resize = () => { const w = element.clientWidth || 600; renderer.setSize(w, 380); camera.aspect = w / 380; camera.updateProjectionMatrix(); draw(); };
            const observer = new ResizeObserver(resize); observer.observe(element);
            const ray = new T.Raycaster(); let start = null;
            const down = e => { start = [e.clientX, e.clientY]; };
            const up = e => { if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return; const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); const hit = ray.intersectObjects(objects)[0]; if (hit) callback.current(hit.object.userData.id); };
            renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up);
            controls.addEventListener('change', draw); document.addEventListener('visibilitychange', draw); resize();
            cleanup = () => { highlight.current = null; observer.disconnect(); controls.dispose(); document.removeEventListener('visibilitychange', draw); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); labels.forEach(label => label.element.remove()); renderer.dispose(); renderer.domElement.remove(); };
        }).catch(reason => { if (!disposed) setError(`3D unavailable: ${reason.message}. Use the 2D view or component list.`); });
        return () => { disposed = true; cleanup(); };
    }, [plan]);
    return <div><p className="text-xs text-theme-muted mb-2">Drag to orbit; scroll to zoom. Select a block or use the component list to inspect it.</p>{error && <p role="alert">{error}</p>}<div ref={host} className="relative overflow-hidden min-h-64 rounded-lg bg-theme-bg" aria-label="3D deployment relationships" /></div>;
}
