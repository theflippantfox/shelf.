<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }     from '$lib/stores/toast.svelte';
  import { auth }       from '$lib/stores/auth.svelte';
  import { PERMISSIONS } from '$lib/config/permissions';
  import { getEffectivePermissions } from '$lib/utils/permissions';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import Modal     from '$lib/components/ui/Modal.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import Toggle    from '$lib/components/ui/Toggle.svelte';
  import Avatar    from '$lib/components/ui/Avatar.svelte';
  import { ArrowLeft, Plus, Pencil, UserMinus, Crown, ShieldCheck, UserCheck } from 'lucide-svelte';

  let { data } = $props();

  const roleIcon: Record<string, typeof Crown> = { owner: Crown, manager: ShieldCheck, cashier: UserCheck };
  const roleColors: Record<string, string> = {
    owner: 'var(--gold)', manager: 'var(--primary)', cashier: 'var(--cobalt)',
  };

  let showAdd     = $state(false);
  let showPerms   = $state(false);
  let editMember  = $state<any>(null);
  let saving      = $state(false);
  let form        = $state({ first_name:'', last_name:'', email:'', password:'', role:'cashier' });
  let customPerms = $state<Record<string, boolean>>({});

  const roleOptions = [
    { value: 'owner',   label: 'Owner'   },
    { value: 'manager', label: 'Manager' },
    { value: 'cashier', label: 'Cashier' },
  ];

  function openPerms(m: any) {
    editMember  = m;
    customPerms = { ...getEffectivePermissions(m.role, m.permissions ?? {}) };
    showPerms   = true;
  }

  async function addMember() {
    saving = true;
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toasts.success('Team member added'); showAdd = false; form = { first_name:'', last_name:'', email:'', password:'', role:'cashier' };
      await invalidateAll();
    } else {
      const d = await res.json();
      toasts.error(d.error ?? 'Failed to add member');
    }
    saving = false;
  }

  async function savePerms() {
    saving = true;
    const defaults = getEffectivePermissions(editMember.role, {});
    // Only store overrides that differ from role defaults
    const overrides: Record<string, boolean> = {};
    for (const p of PERMISSIONS) {
      if (customPerms[p] !== defaults[p]) overrides[p] = customPerms[p];
    }
    const res = await fetch(`/api/users/${editMember.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: overrides }),
    });
    if (res.ok) { toasts.success('Permissions saved'); showPerms = false; await invalidateAll(); }
    else toasts.error('Failed to save permissions');
    saving = false;
  }

  async function suspend(m: any) {
    if (!confirm(`Remove ${m.user.first_name} from the team?`)) return;
    const res = await fetch(`/api/users/${m.id}`, { method: 'DELETE' });
    if (res.ok) { toasts.success('Member removed'); await invalidateAll(); }
    else toasts.error('Failed to remove member');
  }

  const PERM_LABELS: Record<string, string> = {
    'sales.create':    'Create sales',
    'sales.void':      'Void sales',
    'sales.view_all':  'View all sales',
    'inventory.view':  'View inventory',
    'inventory.manage':'Manage inventory',
    'customers.view':  'View customers',
    'customers.manage':'Manage customers',
    'analytics.view':  'View analytics',
    'reports.export':  'Export reports',
    'settings.view':   'View settings',
    'settings.manage': 'Manage settings',
    'users.manage':    'Manage team',
  };
</script>

<svelte:head><title>Team · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <p class="font-semibold text-sm flex-1">Team</p>
    <Button size="sm" onclick={() => showAdd = true}><Plus size={14} strokeWidth={2} /> Add member</Button>
  </div>

  <div class="card overflow-hidden">
    {#each data.members as m}
      {@const Icon = roleIcon[(m as any).role] ?? UserCheck}
      {@const isMe = (m as any).user?.id === auth.user?.id}
      <div class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] {(m as any).status === 'suspended' ? 'opacity-40' : ''}">
        <Avatar name={`${(m as any).user?.first_name} ${(m as any).user?.last_name}`} size={34} />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="text-xs font-semibold truncate">{(m as any).user?.first_name} {(m as any).user?.last_name}</p>
            {#if isMe}<span class="badge badge-neutral text-[9px] px-1.5 py-0">You</span>{/if}
          </div>
          <p class="text-[10px] text-[var(--text-3)]">{(m as any).user?.email}</p>
        </div>
        <div class="flex items-center gap-1" style="color:{roleColors[(m as any).role]}">
          <Icon size={13} strokeWidth={1.75} />
          <span class="text-[10px] font-semibold capitalize">{(m as any).role}</span>
        </div>
        {#if !isMe}
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => openPerms(m)} title="Edit permissions">
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => suspend(m)} title="Remove">
              <UserMinus size={13} strokeWidth={1.75} />
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</PageShell>

<!-- Add member modal -->
<Modal bind:open={showAdd} title="Add team member" maxWidth="max-w-sm">
  <form onsubmit={(e) => { e.preventDefault(); addMember(); }} class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-2">
      <Input label="First name" bind:value={form.first_name} required />
      <Input label="Last name"  bind:value={form.last_name} />
    </div>
    <Input label="Email"    type="email"    bind:value={form.email}    required />
    <Input label="Password" type="password" bind:value={form.password} required
           hint="They can change it after first login." />
    <Select label="Role" bind:value={form.role} options={roleOptions} />
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showAdd = false}>Cancel</Button>
      <Button loading={saving} onclick={addMember}>Add member</Button>
    </div>
  {/snippet}
</Modal>

<!-- Permissions modal -->
<Modal bind:open={showPerms} title="Edit permissions — {editMember?.user?.first_name}" maxWidth="max-w-sm">
  {#if editMember}
    <p class="text-xs text-[var(--text-3)] mb-4">
      Role: <strong class="capitalize">{editMember.role}</strong>.
      Overrides below change just this person's access.
    </p>
    <div class="flex flex-col gap-2.5">
      {#each PERMISSIONS as perm}
        <div class="flex items-center justify-between">
          <span class="text-xs">{PERM_LABELS[perm] ?? perm}</span>
          <Toggle bind:checked={customPerms[perm]} />
        </div>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showPerms = false}>Cancel</Button>
      <Button loading={saving} onclick={savePerms}>Save permissions</Button>
    </div>
  {/snippet}
</Modal>
