const HOSTNAME = 'kubernetes.io/hostname';
const INTERMEDIATE = /(nvlink|clique|rack|block|superpod|subblock|switch|domain)/i;
const WIDE = ['topology.kubernetes.io/zone', 'topology.kubernetes.io/region'];

/** Node-label keys usable as a slice domain, narrowest first; mirrors the server recommendation order. */
export function sliceTopologyKeys(labels) {
    const keys = new Set(labels.map(item => item.key));
    const intermediate = [...keys].filter(key => INTERMEDIATE.test(key) && key !== HOSTNAME && !WIDE.includes(key)).sort();
    const preferred = [HOSTNAME, ...intermediate, ...WIDE].filter(key => keys.has(key));
    return [...preferred, ...[...keys].filter(key => !preferred.includes(key)).sort()];
}

export const isDisaggregatedDraft = draft => Boolean(draft?.runtimeConfiguration?.prefillReplicas);

/** Mirrors the server rule: node-scoped slices conflict with Pod placement that separates or pins all Pods. */
export function podPlacementConflict(podPlacement, slices, policy) {
    if (!policy || policy.type === 'None' || policy.topology !== HOSTNAME) return '';
    if (['balanced', 'spread'].includes(podPlacement)) return `Pod placement '${podPlacement}' separates model-server Pods across nodes, but slice placement on ${HOSTNAME} keeps each slice's Prefill and Decode on one node. Choose a wider topology key or None.`;
    if (podPlacement === 'same-node' && slices > 1) return `Pod placement 'same-node' puts every Pod on one node, but slice placement on ${HOSTNAME} puts each slice on a different node. Use one slice or a wider topology key.`;
    return '';
}
