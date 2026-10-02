import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { CheckCircle2, KeyRound, Pencil, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { ModuleHeader } from '../ui/ModuleHeader';
import { ModulePage } from '../ui/ModulePage';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FormError } from '../ui/FormError';
import { Checkbox, Input, Label, Select } from '../ui/FormControls';
import { Badge } from '../ui/Badge';
import { AsyncState } from '../shared/AsyncState';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { useNotice } from '../../hooks/useNotice';
import { useSubmission } from '../../hooks/useSubmission';
import { errorMessage } from '../../utils/errorMessage';
import { PermissionGate } from '../../features/auth/PermissionGate';
import {
    createIdentityProvider,
    createMapping,
    deleteIdentityProvider,
    deleteMapping,
    listGroups,
    listIdentityProviders,
    listMappings,
    listRoles,
    testIdentityProvider,
    updateIdentityProvider,
} from '../../features/auth/adminClient';
import { AdminPanel } from './AdminPanel';
import { AdminAlert } from './AdminAlert';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

const EMPTY = {
    type: 'ldap',
    name: '',
    server_url: '',
    user_base_dn: '',
    user_filter: '(uid={username})',
    username_attribute: 'uid',
    display_name_attribute: 'cn',
    email_attribute: 'mail',
    bind_dn: '',
    bind_password: '',
    enabled: true,
    is_default: false,
};

export default function IdentityProvidersPage({ onToggleMobileNav }) {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useNotice();
    const [dialog, setDialog] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [pendingMappings, setPendingMappings] = useState(null);
    const [testingId, setTestingId] = useState(null);
    const [testResults, setTestResults] = useState({});
    const loadedOnce = useRef(false);

    const load = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet && loadedOnce.current) setRefreshing(true);
        try {
            setProviders(await listIdentityProviders());
            setError('');
        } catch (failure) {
            setError(errorMessage(failure, 'Failed to load identity providers'));
        } finally {
            loadedOnce.current = true;
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);
    usePolling(() => load({ quiet: true }));

    const runTest = async (provider) => {
        setTestingId(provider.id);
        setTestResults((prev) => ({ ...prev, [provider.id]: null }));
        try {
            const result = await testIdentityProvider(provider.id);
            setTestResults((prev) => ({ ...prev, [provider.id]: result }));
        } catch (failure) {
            setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, detail: errorMessage(failure, 'Test failed') } }));
        } finally {
            setTestingId(null);
        }
    };

    const confirmDelete = async () => {
        await deleteIdentityProvider(pendingDelete.id);
        setPendingDelete(null);
        await load();
        setNotice(`Deleted ${pendingDelete.name}`);
    };

    return (
        <ModulePage>
            <div className="flex w-full flex-col gap-6">
                <ModuleHeader
                    icon={KeyRound}
                    title="Identity providers"
                    badge="Experimental"
                    description="Connect external directories (LDAP) so directory users can sign in to Lens. This integration is experimental; behavior and configuration may change."
                    onToggleMobileNav={onToggleMobileNav}
                    actions={
                        <>
                            <Button variant="secondary" size="sm" onClick={load} isLoading={refreshing} disabled={loading}>
                                <RefreshCw size={14} /> Refresh
                            </Button>
                            <PermissionGate permission="idp:provider:configure">
                                <Button variant="sky" size="sm" onClick={() => setDialog({ mode: 'add' })}>
                                    <Plus size={14} /> Add provider
                                </Button>
                            </PermissionGate>
                        </>
                    }
                />

                <AdminAlert tone="success">{notice}</AdminAlert>
                {error && providers.length > 0 && <AdminAlert>{error}</AdminAlert>}

                <AsyncState
                    loading={loading}
                    error={providers.length === 0 ? error : null}
                    empty={providers.length === 0}
                    onRetry={load}
                    emptyContent={
                        <EmptyState
                            icon={<KeyRound size={22} />}
                            title="No external identity providers"
                            message="Lens manages local accounts by default. Add an LDAP provider to authenticate directory users."
                            action={<PermissionGate permission="idp:provider:configure"><Button variant="sky" size="sm" onClick={() => setDialog({ mode: 'add' })}><Plus size={14} /> Add provider</Button></PermissionGate>}
                        />
                    }
                >
                    <AdminPanel icon={KeyRound} title="Providers" count={providers.length}>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[46rem] text-left text-sm">
                                <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">Enabled</th>
                                        <th className="px-4 py-3">Default</th>
                                        <th className="px-4 py-3">Test</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {providers.map((provider) => {
                                        const result = testResults[provider.id];
                                        const isTesting = testingId === provider.id;
                                        return (
                                            <tr key={provider.id} className="border-t border-slate-800">
                                                <td className="px-4 py-3 font-medium text-slate-100">{provider.name}</td>
                                                <td className="px-4 py-3"><Badge tone="info">{provider.type}</Badge></td>
                                                <td className="px-4 py-3 text-slate-300">{provider.enabled ? 'Yes' : 'No'}</td>
                                                <td className="px-4 py-3 text-slate-300">{provider.is_default ? 'Yes' : '—'}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="secondary" size="xs" onClick={() => runTest(provider)} isLoading={isTesting}>Test</Button>
                                                        {result && !isTesting && (
                                                            <span className={`flex items-center gap-1 text-xs ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`} title={result.detail}>
                                                                {result.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <PermissionGate permission="idp:mapping:manage">
                                                            <Button variant="secondary" size="xs" onClick={() => setPendingMappings(provider)}>Mappings</Button>
                                                        </PermissionGate>
                                                        <PermissionGate permission="idp:provider:configure">
                                                            <Button variant="ghost" size="icon" onClick={() => setDialog({ mode: 'edit', provider })} aria-label={`Edit ${provider.name}`}>
                                                                <Pencil size={14} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => setPendingDelete(provider)} aria-label={`Delete ${provider.name}`}>
                                                                <Trash2 size={14} className="text-rose-400" />
                                                            </Button>
                                                        </PermissionGate>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </AdminPanel>
                </AsyncState>
            </div>

            {dialog && (
                <ProviderFormModal
                    provider={dialog.mode === 'edit' ? dialog.provider : null}
                    onCancel={() => setDialog(null)}
                    onSaved={() => { setDialog(null); load(); setNotice(dialog.mode === 'edit' ? 'Provider updated' : 'Provider created'); }}
                />
            )}
            {pendingMappings && <MappingsModal provider={pendingMappings} onCancel={() => setPendingMappings(null)} />}
            {pendingDelete && (
                <ConfirmDeleteModal
                    title="Delete identity provider"
                    subtitle={pendingDelete.name}
                    warning="Directory users keep their Lens accounts but can no longer sign in through this provider."
                    confirmLabel="Delete provider"
                    onCancel={() => setPendingDelete(null)}
                    onDelete={confirmDelete}
                />
            )}
        </ModulePage>
    );
}

function ProviderFormModal({ provider, onCancel, onSaved }) {
    const isEdit = Boolean(provider);
    const [form, setForm] = useState(() => (provider
        ? {
            type: provider.type || 'ldap',
            name: provider.name || '',
            server_url: provider.config?.server_url || '',
            user_base_dn: provider.config?.user_base_dn || '',
            user_filter: provider.config?.user_filter || '(uid={username})',
            username_attribute: provider.config?.username_attribute || 'uid',
            display_name_attribute: provider.config?.display_name_attribute || 'cn',
            email_attribute: provider.config?.email_attribute || 'mail',
            bind_dn: provider.config?.bind_dn || '',
            bind_password: '',
            enabled: Boolean(provider.enabled),
            is_default: Boolean(provider.is_default),
        }
        : EMPTY));
    const { pending, error, run } = useSubmission(`Failed to ${isEdit ? 'update' : 'create'} provider`, { keepPendingOnSuccess: true });
    const nameRef = useRef(null);
    useEffect(() => nameRef.current?.focus(), []);
    const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

    const submit = async (event) => {
        event.preventDefault();
        if (pending) return;
        await run(async () => {
            const payload = {
                type: form.type,
                name: form.name.trim(),
                enabled: form.enabled,
                isDefault: form.is_default,
                config: {
                    server_url: form.server_url.trim(),
                    user_base_dn: form.user_base_dn.trim(),
                    user_filter: form.user_filter.trim(),
                    username_attribute: form.username_attribute.trim(),
                    display_name_attribute: form.display_name_attribute.trim(),
                    email_attribute: form.email_attribute.trim(),
                    bind_dn: form.bind_dn.trim(),
                },
                syncMode: 'login',
            };
            if (form.bind_password) payload.secret = form.bind_password;
            if (isEdit) await updateIdentityProvider(provider.id, payload);
            else await createIdentityProvider(payload);
            onSaved();
        });
    };

    return (
        <Modal
            isOpen
            onClose={pending ? undefined : onCancel}
            title={isEdit ? 'Edit identity provider' : 'Add identity provider'}
            subtitle="LDAP directory. The bind password is encrypted at rest and never returned."
            variant="drawer"
            size="lg"
            closeOnBackdrop={!pending}
            closeOnEscape={!pending}
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
                    <Button type="submit" form="admin-idp-form" variant="primary" isLoading={pending}>{isEdit ? 'Save changes' : 'Add provider'}</Button>
                </>
            }
        >
            <form id="admin-idp-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <Label htmlFor="admin-idp-name">Name</Label>
                    <Input ref={nameRef} id="admin-idp-name" value={form.name} onChange={setField('name')} placeholder="e.g. corp-ldap" required maxLength={150} />
                </div>
                <div className="sm:col-span-2">
                    <Label htmlFor="admin-idp-url">Server URL</Label>
                    <Input id="admin-idp-url" value={form.server_url} onChange={setField('server_url')} placeholder="ldaps://ldap.example.com:636" required />
                </div>
                <div>
                    <Label htmlFor="admin-idp-base">User base DN</Label>
                    <Input id="admin-idp-base" value={form.user_base_dn} onChange={setField('user_base_dn')} placeholder="ou=people,dc=example,dc=com" required />
                </div>
                <div>
                    <Label htmlFor="admin-idp-filter">User filter</Label>
                    <Input id="admin-idp-filter" value={form.user_filter} onChange={setField('user_filter')} placeholder="(uid={username})" />
                </div>
                <div>
                    <Label htmlFor="admin-idp-username-attr">Username attribute</Label>
                    <Input id="admin-idp-username-attr" value={form.username_attribute} onChange={setField('username_attribute')} />
                </div>
                <div>
                    <Label htmlFor="admin-idp-display-attr">Display name attribute</Label>
                    <Input id="admin-idp-display-attr" value={form.display_name_attribute} onChange={setField('display_name_attribute')} />
                </div>
                <div>
                    <Label htmlFor="admin-idp-email-attr">Email attribute</Label>
                    <Input id="admin-idp-email-attr" value={form.email_attribute} onChange={setField('email_attribute')} />
                </div>
                <div>
                    <Label htmlFor="admin-idp-bind-dn">Bind DN</Label>
                    <Input id="admin-idp-bind-dn" value={form.bind_dn} onChange={setField('bind_dn')} placeholder="cn=svc,dc=example,dc=com" />
                </div>
                <div className="sm:col-span-2">
                    <Label htmlFor="admin-idp-bind-pw">Bind password {isEdit && <span className="font-normal text-slate-500">(leave blank to keep)</span>}</Label>
                    <Input id="admin-idp-bind-pw" type="password" autoComplete="new-password" value={form.bind_password} onChange={setField('bind_password')} />
                </div>
                <div className="flex items-center gap-6 sm:col-span-2">
                    <Checkbox label="Enabled" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
                    <Checkbox label="Default provider" checked={form.is_default} onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))} />
                </div>
                <div className="sm:col-span-2"><FormError message={error} /></div>
            </form>
        </Modal>
    );
}

function MappingsModal({ provider, onCancel }) {
    const [mappings, setMappings] = useState([]);
    const [groups, setGroups] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [externalGroup, setExternalGroup] = useState('');
    const [groupId, setGroupId] = useState('');
    const [roleId, setRoleId] = useState('');
    const { pending, error: saveError, run } = useSubmission('Failed to update mappings');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [mappingList, groupList, roleList] = await Promise.all([listMappings(provider.id), listGroups(), listRoles()]);
            setMappings(mappingList);
            setGroups(groupList);
            setRoles(roleList);
            setError('');
        } catch (failure) {
            setError(errorMessage(failure, 'Failed to load mappings'));
        } finally {
            setLoading(false);
        }
    }, [provider.id]);

    useEffect(() => { load(); }, [load]);

    const add = async (event) => {
        event.preventDefault();
        if (pending || !externalGroup.trim()) return;
        if (!groupId && !roleId) return;
        await run(async () => {
            await createMapping(provider.id, {
                externalGroup: externalGroup.trim(),
                groupId: groupId || null,
                roleId: roleId || null,
            });
            setExternalGroup('');
            setGroupId('');
            setRoleId('');
            await load();
        });
    };

    const remove = async (mapping) => {
        await run(async () => {
            await deleteMapping(provider.id, mapping.id);
            await load();
        });
    };

    return (
        <Modal
            isOpen
            onClose={pending ? undefined : onCancel}
            title="Group mappings"
            subtitle={provider.name}
            size="lg"
            closeOnBackdrop={!pending}
            closeOnEscape={!pending}
            footer={<Button variant="secondary" onClick={onCancel} disabled={pending}>Close</Button>}
        >
            <div className="flex flex-col gap-4">
                <form onSubmit={add} className="flex flex-col gap-3 rounded-xl border border-theme-border p-3">
                    <div>
                        <Label htmlFor="admin-mapping-external">External group</Label>
                        <Input id="admin-mapping-external" value={externalGroup} onChange={(e) => setExternalGroup(e.target.value)} placeholder="cn=platform-team,ou=groups,dc=example,dc=com" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="admin-mapping-group">Lens group</Label>
                            <Select id="admin-mapping-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                                <option value="">—</option>
                                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="admin-mapping-role">Or role</Label>
                            <Select id="admin-mapping-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                                <option value="">—</option>
                                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </Select>
                        </div>
                    </div>
                    <div><Button type="submit" variant="primary" size="sm" isLoading={pending}>Add mapping</Button></div>
                </form>

                <FormError message={saveError} />
                {error && <AdminAlert>{error}</AdminAlert>}

                {loading ? (
                    <div className="flex justify-center p-4"><Spinner /></div>
                ) : mappings.length === 0 ? (
                    <EmptyState title="No mappings" message="Map an external directory group to a Lens group or role." />
                ) : (
                    <ul className="flex flex-col gap-2">
                        {mappings.map((mapping) => (
                            <li key={mapping.id} className="flex items-center justify-between gap-3 rounded-lg border border-theme-border px-3 py-2 text-sm">
                                <span className="min-w-0 truncate font-mono text-xs text-theme-text" title={mapping.external_group}>{mapping.external_group}</span>
                                <span className="flex items-center gap-2">
                                    <Badge tone={mapping.group_id ? 'brand' : 'violet'}>
                                        {mapping.group_id ? `group: ${groups.find((g) => g.id === mapping.group_id)?.name || mapping.group_id}` : `role: ${roles.find((r) => r.id === mapping.role_id)?.name || mapping.role_id}`}
                                    </Badge>
                                    <Button variant="ghost" size="icon" onClick={() => remove(mapping)} aria-label="Remove mapping" disabled={pending}>
                                        <Trash2 size={14} className="text-rose-400" />
                                    </Button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
