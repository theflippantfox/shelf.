<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { getCustomerTier, TIER_LABELS, TIER_BADGE_CLASS } from '$lib/utils/tiers';
  import { formatCurrency } from '$lib/utils/format';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import SearchBar  from '$lib/components/ui/SearchBar.svelte';
  import Button     from '$lib/components/ui/Button.svelte';
  import Modal      from '$lib/components/ui/Modal.svelte';
  import Input      from '$lib/components/ui/Input.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Avatar     from '$lib/components/ui/Avatar.svelte';
  import { Plus, Pencil, Trash2 } from 'lucide-svelte';

  let { data } = $props();

  let search  = $state('');
  let showAdd = $state(false);
  let editing = $state<any>(null);
  let saving  = $state(false);
  let form    = $state({ name: '', phone: '', email: '', notes: '' });

  const filtered = $derived(() => {
    if (!search) return data.customers as any[];
    const q = search.toLowerCase();
    return (data.customers as any[]).filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  });

  function openAdd() {
    form = { name: '', phone: '', email: '', notes: '' };
    editing = null; showAdd = true;
  }

  function openEdit(e: MouseEvent, c: any) {
    e.preventDefault();  // don't navigate to detail page
    form    = { name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' };
    editing = c; showAdd = true;
  }

  async function save() {
    saving = true;
    const url    = editing ? `/api/customers/${editing.id}` : '/api/customers';
    const method = editing ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (res.ok) {
      toasts.success(editing ? 'Customer updated' : 'Customer added');
      showAdd = false;
      await invalidateAll();
    } else toasts.error('Failed to save customer');
    saving = false;
  }

  async function remove(e: MouseEvent, c: any) {
    e.preventDefault();
    if (!confirm(`Delete ${c.name}?`)) return;
    const res = await fetch(`/api/customers/${c.id}`, { method: 'DELETE' });
    if (res.ok) { toasts.success('Customer removed'); await invalidateAll(); }
    else toasts.error('Failed to delete');
  }
</script>

<svelte:head><title>Customers · Shëlf</title></svelte:head>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Customers</p>
      <p class="text-xs text-[var(--text-3)]">{(data.customers as any[]).length} total</p>
    </div>
    <Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add</Button>
  </div>

  <SearchBar bind:value={search} placeholder="Search by name or phone…" class="mb-4" />

  {#if filtered().length === 0}
    <EmptyState icon="Users" title="No customers yet" message="Add your first customer to start tracking visits.">
      {#snippet action()}
        <Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add customer</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="card overflow-hidden">
      {#each filtered() as c}
        {@const tier = getCustomerTier(c)}
        <a
          href="/customers/{(c as any).id}"
          class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
        >
          <Avatar name={(c as any).name} size={36} />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-xs font-semibold truncate">{(c as any).name}</p>
              <span class="badge {TIER_BADGE_CLASS[tier]} text-[10px]">{TIER_LABELS[tier]}</span>
            </div>
            <p class="text-[10px] text-[var(--text-3)]">
              {(c as any).phone ?? (c as any).email ?? 'No contact'} · {(c as any).visit_count} visit{(c as any).visit_count !== 1 ? 's' : ''}
            </p>
          </div>
          <div class="text-right flex-shrink-0 mr-1">
            <p class="text-xs font-semibold">{formatCurrency((c as any).total_spent)}</p>
            <p class="text-[10px] text-[var(--text-3)]">total spent</p>
          </div>
          <div class="flex gap-1" onclick={(e) => e.stopPropagation()}>
            <button class="btn btn-ghost btn-icon btn-sm" onclick={(e) => openEdit(e, c)}>
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={(e) => remove(e, c)}>
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</PageShell>

<Modal bind:open={showAdd} title={editing ? 'Edit customer' : 'New customer'} maxWidth="max-w-sm">
  <form onsubmit={(e) => { e.preventDefault(); save(); }} class="flex flex-col gap-3">
    <Input label="Full name" bind:value={form.name}  required />
    <Input label="Phone"     bind:value={form.phone}  type="tel" />
    <Input label="Email"     bind:value={form.email}  type="email" />
    <div class="input-group">
      <label class="input-label">Notes</label>
      <textarea bind:value={form.notes} class="input" rows="2"></textarea>
    </div>
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showAdd = false}>Cancel</Button>
      <Button loading={saving} onclick={save}>Save</Button>
    </div>
  {/snippet}
</Modal>
