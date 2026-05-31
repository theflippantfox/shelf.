<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { formatCurrency, formatDate, formatDateTime } from '$lib/utils/format';
  import { getCustomerTier, TIER_LABELS, TIER_BADGE_CLASS } from '$lib/utils/tiers';
  import { toasts }   from '$lib/stores/toast.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Avatar    from '$lib/components/ui/Avatar.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import Modal     from '$lib/components/ui/Modal.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { ArrowLeft, Pencil, Trash2, ShoppingCart } from 'lucide-svelte';

  let { data } = $props();
  const c       = $derived(data.customer as any);
  const sales   = $derived(data.sales as any[]);
  const tier    = $derived(getCustomerTier(c));

  let showEdit = $state(false);
  let saving   = $state(false);
  let form     = $state({ name: '', phone: '', email: '', notes: '' });

  function openEdit() {
    form = { name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' };
    showEdit = true;
  }

  async function save() {
    saving = true;
    const res = await fetch(`/api/customers/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (res.ok) { toasts.success('Customer updated'); showEdit = false; await invalidateAll(); }
    else toasts.error('Failed to update customer');
    saving = false;
  }

  async function remove() {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/customers/${c.id}`, { method: 'DELETE' });
    if (res.ok) { toasts.success('Customer deleted'); goto('/customers'); }
    else toasts.error('Failed to delete customer');
  }
</script>

<svelte:head><title>{c.name} · Shëlf</title></svelte:head>

<PageShell>
  <!-- Back + actions -->
  <div class="flex items-center gap-2 mb-5">
    <a href="/customers" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <div class="flex-1"></div>
    <button class="btn btn-ghost btn-icon btn-sm" onclick={openEdit}><Pencil size={15} strokeWidth={1.75} /></button>
    <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={remove}><Trash2 size={15} strokeWidth={1.75} /></button>
  </div>

  <!-- Profile card -->
  <div class="card p-5 mb-4">
    <div class="flex items-center gap-3 mb-4">
      <Avatar name={c.name} size={44} />
      <div>
        <p class="font-semibold text-sm">{c.name}</p>
        <span class="badge {TIER_BADGE_CLASS[tier]} text-[10px]">{TIER_LABELS[tier]}</span>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 text-xs">
      <div>
        <p class="text-[var(--text-3)] mb-0.5">Total spent</p>
        <p class="font-semibold text-sm">{formatCurrency(c.total_spent)}</p>
      </div>
      <div>
        <p class="text-[var(--text-3)] mb-0.5">Visits</p>
        <p class="font-semibold text-sm">{c.visit_count}</p>
      </div>
      {#if c.phone}
        <div>
          <p class="text-[var(--text-3)] mb-0.5">Phone</p>
          <a href="tel:{c.phone}" class="font-medium text-[var(--primary)]">{c.phone}</a>
        </div>
      {/if}
      {#if c.email}
        <div>
          <p class="text-[var(--text-3)] mb-0.5">Email</p>
          <a href="mailto:{c.email}" class="font-medium text-[var(--primary)] truncate block">{c.email}</a>
        </div>
      {/if}
      {#if c.last_visit}
        <div class="col-span-2">
          <p class="text-[var(--text-3)] mb-0.5">Last visit</p>
          <p class="font-medium">{formatDate(c.last_visit)}</p>
        </div>
      {/if}
      {#if c.notes}
        <div class="col-span-2 mt-1 pt-3 border-t border-[var(--border)]">
          <p class="text-[var(--text-3)] mb-0.5">Notes</p>
          <p class="text-[var(--text-2)] leading-relaxed">{c.notes}</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Sales history -->
  <div>
    <p class="section-lbl mb-3">Purchase history</p>
    {#if sales.length === 0}
      <EmptyState icon="ShoppingCart" title="No purchases yet" />
    {:else}
      <div class="card overflow-hidden">
        {#each sales as s}
          <a href="/history/{s.id}"
             class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface2)] transition-colors">
            <div class="w-7 h-7 rounded-full bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0">
              <ShoppingCart size={12} style="color:var(--primary)" strokeWidth={1.75} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold font-mono">{s.sale_ref}</p>
              <p class="text-[10px] text-[var(--text-3)]">{formatDateTime(s.date_created)}</p>
            </div>
            <p class="text-xs font-semibold">{formatCurrency(s.total)}</p>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</PageShell>

<Modal bind:open={showEdit} title="Edit customer" maxWidth="max-w-sm">
  <form onsubmit={(e) => { e.preventDefault(); save(); }} class="flex flex-col gap-3">
    <Input label="Name"  bind:value={form.name}  required />
    <Input label="Phone" bind:value={form.phone}  type="tel" />
    <Input label="Email" bind:value={form.email}  type="email" />
    <div class="input-group">
      <label class="input-label">Notes</label>
      <textarea bind:value={form.notes} class="input" rows="2"></textarea>
    </div>
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showEdit = false}>Cancel</Button>
      <Button loading={saving} onclick={save}>Save</Button>
    </div>
  {/snippet}
</Modal>
