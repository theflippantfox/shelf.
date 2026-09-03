<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }     from '$lib/stores/toast.svelte';
  import { auth }       from '$lib/stores/auth.svelte';
  import { PERMISSIONS } from '$lib/config/permissions';
  import { getEffectivePermissions } from '$lib/utils/permissions';
  import Button    from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import Toggle    from '$lib/components/ui/Toggle.svelte';
  import Avatar    from '$lib/components/ui/Avatar.svelte';
  import { ArrowLeft, Plus, Pencil, UserMinus, Crown, ShieldCheck, UserCheck, Mail, X } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  let { data } = $props();

  const roleIcon: Record<string, typeof Crown> = { owner: Crown, manager: ShieldCheck, cashier: UserCheck };
  const roleColors: Record<string, string> = {
    owner: 'var(--gold)', manager: 'var(--primary)', cashier: 'var(--cobalt)',
  };

  let showAdd     = $state(false);
  let showPerms   = $state(false);
  let editMember  = $state<any>(null);
  let saving      = $state(false);
  let form        = $state({ email: '', role: 'cashier' });
  let customPerms = $state<Record<string, boolean>>({});

  const roleOptions = [
    { value: 'owner',   label: 'Owner'   },
    { value: 'manager', label: 'Manager' },
    { value: 'cashier', label: 'Cashier' },
  ];

  // Split members into active and pending. data.members is already
  // ordered by status (invited < active alphabetically) so the
  // filter preserves the server-side ordering.
  const active = $derived((data.members ?? []).filter((m: any) => m.status === 'active'));
  const pending = $derived((data.members ?? []).filter((m: any) => m.status === 'invited'));

  function openPerms(m: any) {
    editMember  = m;
    customPerms = { ...getEffectivePermissions(m.role, m.permissions ?? {}) };
    showPerms   = true;
  }

  async function invite() {
    saving = true;
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toasts.success(`Invite sent to ${form.email}`);
      showAdd = false;
      form = { email: '', role: 'cashier' };
      await invalidateAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toasts.error(d.message || d.error || 'Failed to send invite');
    }
    saving = false;
  }

  async function savePerms() {
    saving = true;
    const defaults = getEffectivePermissions(editMember.role, {});
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

  async function cancelInvite(m: any) {
    if (!confirm(`Cancel the invite for ${m.user?.email}?`)) return;
    const res = await fetch(`/api/users/${m.id}`, { method: 'DELETE' });
    if (res.ok) { toasts.success('Invite cancelled'); await invalidateAll(); }
    else toasts.error('Failed to cancel invite');
  }

  async function remove(m: any) {
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

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">Team</h1>
    <p class="text-[12px] text-[var(--text-3)] mt-0.5">Invite existing Shëlf users and manage their roles.</p>
  </div>
  <Button size="sm" onclick={() => showAdd = true}><Plus size={14} strokeWidth={2} /> Invite member</Button>
</header>

<!-- Pending invites -->
{#if pending.length > 0}
  <div class="mb-5">
    <h2 class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Pending invites</h2>
    <div class="surface-card overflow-hidden">
      {#each pending as m (m.id)}
        <div class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)]">
          <div class="w-[34px] h-[34px] rounded-full bg-[var(--primary-dim)] flex items-center justify-center text-[var(--primary)]">
            <Mail size={14} strokeWidth={1.75} />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold truncate">{m.user?.email}</p>
            <p class="text-[10px] text-[var(--text-3)]">
              Invited {new Date(m.invited_at).toLocaleDateString()}{#if m.invited_by_name} by {m.invited_by_name}{/if}
            </p>
          </div>
          <span class="text-[10px] font-semibold capitalize px-2 py-0.5 rounded-full"
                style="background:color-mix(in srgb, {roleColors[m.role]} 15%, transparent); color:{roleColors[m.role]}">
            {m.role}
          </span>
          <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => cancelInvite(m)} title="Cancel invite" aria-label={`Cancel invite for ${m.user?.email}`}>
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- Active members -->
<div>
  <h2 class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Active members</h2>
  <div class="surface-card overflow-hidden">
    {#each active as m (m.id)}
      {@const Icon = roleIcon[m.role] ?? UserCheck}
      {@const isMe = m.user?.id === auth.user?.id}
      <div class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] {m.status === 'suspended' ? 'opacity-40' : ''}">
        <Avatar name={`${m.user?.first_name} ${m.user?.last_name}`} size={34} />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="text-xs font-semibold truncate">{m.user?.first_name} {m.user?.last_name}</p>
            {#if isMe}<span class="badge badge-neutral text-[9px] px-1.5 py-0">You</span>{/if}
          </div>
          <p class="text-[10px] text-[var(--text-3)]">{m.user?.email}</p>
        </div>
        <div class="flex items-center gap-1" style="color:{roleColors[m.role]}">
          <Icon size={13} strokeWidth={1.75} />
          <span class="text-[10px] font-semibold capitalize">{m.role}</span>
        </div>
        {#if !isMe}
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => openPerms(m)} title="Edit permissions" aria-label={`Edit permissions for ${m.user?.first_name}`}>
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => remove(m)} title="Remove" aria-label={`Remove ${m.user?.first_name}`}>
              <UserMinus size={13} strokeWidth={1.75} />
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- Invite modal -->
<Sheet bind:open={showAdd} title="Invite team member" maxWidth="max-w-sm">
  <form onsubmit={(e) => { e.preventDefault(); invite(); }} class="flex flex-col gap-3">
    <Input label="Email" type="email" bind:value={form.email} required
           hint="They must already have a Shëlf account. If not, ask them to sign up first." />
    <Select label="Role" bind:value={form.role} options={roleOptions} />
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showAdd = false}>Cancel</Button>
      <Button loading={saving} onclick={invite}>Send invite</Button>
    </div>
  {/snippet}
</Sheet>

<!-- Permissions modal -->
<Sheet bind:open={showPerms} title="Edit permissions — {editMember?.user?.first_name}" maxWidth="max-w-sm">
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
</Sheet>
