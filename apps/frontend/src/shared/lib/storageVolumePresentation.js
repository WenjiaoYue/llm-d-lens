const KIND_LABELS = {
    'local-disk': 'hostPath',
    nfs: 'NFS',
    'dynamic-pvc': 'Dynamic PVC',
};

const STATUS_DOT_CLASSES = {
    ready: 'bg-emerald-400',
    pending: 'bg-amber-400',
    failed: 'bg-red-400',
    deleting: 'bg-slate-500',
    attention: 'bg-orange-400',
};

export function kindLabel(kind) {
    return KIND_LABELS[kind] || kind || '—';
}

export function statusLabel(status) {
    if (!status) return 'UNKNOWN';
    return String(status).toUpperCase();
}

export function statusDotClass(status) {
    return STATUS_DOT_CLASSES[status] || STATUS_DOT_CLASSES.deleting;
}