<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { formatCurrency, formatDate, formatDateTime } from '$lib/utils/format';
  import { getCustomerTier, TIER_LABELS, TIER_BADGE_CLASS } from '$lib/utils/tiers';
  import { toasts }   from '$lib/stores/toast.svelte';
  import { auth }     from '$lib/stores/auth.svelte';
  import Avatar    from '$lib/components/ui/Avatar.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { ArrowLeft, Pencil, Trash2, ShoppingCart, CheckCircle2, AlertCircle, Calendar } from 'lucide-svelte';

  let { data } = $props();
  const c           = $derived(data.customer as any);
  const sales       = $derived(data.sales as any[]);
  const openCredit  = $derived((data as any).openCredit as any[]);
  const tier        = $derived(getCustomerTier(c));

  // ── Edit form ────────────────────────────────────────────────────────
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

  // ── Record-payment sheet ─────────────────────────────────────────────
  let showPay = $state(false);
  let payTarget = $state<any | null>(null);
  let payAmount = $state('');
  let payDestination = $state<'counter' | 'bank' | 'other'>('counter');
  let payNotes = $state('');
  let paying = $state(false);

  function openPay(sale: any) {
    payTarget = sale;
    const outstanding = Number(sale.total) - Number(sale.credit_amount_paid ?? 0);
    payAmount = outstanding.toFixed(2);
    payDestination = 'counter';
    payNotes = '';
    showPay = true;
  }
  async function submitPayment() {
    if (paying || !payTarget) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      toasts.error('Enter a valid amount');
      return;
    }
    const outstanding = Number(payTarget.total) - Number(payTarget.credit_amount_paid ?? 0);
    if (amt > outstanding) {
      toasts.error(`Amount exceeds outstanding (${formatCurrency(outstanding)})`);
      return;
    }
    paying = true;
    const res = await fetch(`/api/sales/${payTarget.id}/credit-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, destination: payDestination, notes: payNotes || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      const fullyPaid = updated.credit_status === 'paid';
      toasts.success(fullyPaid ? 'Credit settled in full' : `Partial payment recorded`);
      showPay = false;
      payTarget = null;
      await invalidateAll();
    } else {
      const data = await res.json();
      toasts.error(data.error ?? 'Payment failed');
    }
    paying = false;
  }

  // Permissions: only owner + manager can record a payment
  const role = $derived((auth as any).role as 'owner' | 'manager' | 'cashier' | undefined);
  const canRecordPayment = $derived(role === 'owner' || role === 'manager');

  function outstandingOf(s: any) {
    return Number(s.total) - Number(s.credit_amount_paid ?? 0);
  }
  function totalOutstanding() {
    return openCredit.reduce((sum, s) => sum + outstandingOf(s), 0);
  }
</script>

<svelte:head><title>{c.name} · Shëlf</title></svelte:head>

<!-- Back + actions -->
  <div class="flex items-center gap-2 mb-5">
    <a href="/customers" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <div class="flex-1"></div>
    <button class="btn btn-ghost btn-icon btn-sm" onclick={openEdit}><Pencil size={15} strokeWidth={1.75} /></button>
    <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={remove}><Trash2 size={15} strokeWidth={1.75} /></button>
  </div>

  <!-- Profile card -->
  <div class="surface-card p-4 md:p-5 mb-4">
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

  <!-- Credit / receivables section (only if customer has any) -->
  {#if openCredit.length > 0}
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2.5 px-1">
        <p class="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Credit / receivables</p>
        <p class="text-xs font-bold tabular-nums" style="color:var(--gold)">
          {formatCurrency(totalOutstanding())} outstanding
        </p>
      </div>
      <div class="surface-card overflow-hidden">
        {#each openCredit as s (s.id)}
          {@const remaining = outstandingOf(s)}
          <div class="px-3.5 py-3 border-b last:border-0 border-[var(--border)] flex items-start gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                 style="background:color-mix(in srgb, var(--gold) 14%, transparent);">
              <AlertCircle size={14} strokeWidth={2} style="color:var(--gold)" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <a href="/history/{s.id}" class="font-mono text-[11px] font-semibold text-[var(--primary)] hover:underline">
                  {s.sale_ref}
                </a>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded {s.credit_status === 'pending' ? 'bg-[var(--crimson)] text-white' : 'bg-[var(--gold)] text-[var(--gold-fg)]'}">
                  {s.credit_status === 'pending' ? 'Pending' : 'Partial'}
                </span>
                {#if s.credit_due_date}
                  <span class="text-[10px] text-[var(--text-3)] flex items-center gap-0.5">
                    <Calendar size={9} strokeWidth={2.2} />
                    {new Date(s.credit_due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                {/if}
              </div>
              <p class="text-[10px] text-[var(--text-3)] mt-0.5">
                {formatDate(s.date_created ?? s.created_at)} · paid {formatCurrency(s.credit_amount_paid ?? 0)} of {formatCurrency(s.total)}
              </p>
              <div class="flex items-center gap-2 mt-1.5">
                <p class="text-sm font-bold tabular-nums" style="color:var(--gold)">
                  {formatCurrency(remaining)}
                </p>
                <span class="text-[10px] text-[var(--text-3)]">remaining</span>
              </div>
            </div>
            {#if canRecordPayment}
              <Button variant="secondary" size="sm" onclick={() => openPay(s)} class="shrink-0">
                <CheckCircle2 size={12} strokeWidth={2} />
                Record
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Sales history -->
  <div>
    <p class="section-lbl mb-3">Purchase history</p>
    {#if sales.length === 0}
      <EmptyState icon="ShoppingCart" title="No purchases yet" />
    {:else}
      <div class="surface-card overflow-hidden">
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

<Sheet bind:open={showEdit} title="Edit customer" maxWidth="max-w-sm">
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
</Sheet>

<!-- Record-payment sheet — settles some or all of a credit sale -->
<Sheet bind:open={showPay} title="Record credit payment" maxWidth="max-w-md">
  {#if payTarget}
    <div class="flex flex-col gap-3">
      <div class="surface-card-flat p-3 flex items-center gap-2 text-xs">
        <AlertCircle size={14} strokeWidth={2} style="color:var(--gold)" />
        <div>
          <p class="font-semibold">{payTarget.sale_ref}</p>
          <p class="text-[var(--text-3)]">
            {formatCurrency(payTarget.credit_amount_paid ?? 0)} paid of {formatCurrency(payTarget.total)} ·
            <span class="font-semibold" style="color:var(--gold)">{formatCurrency(outstandingOf(payTarget))}</span> remaining
          </p>
        </div>
      </div>

      <div>
        <p class="input-label mb-1.5">
          Amount received
          <span class="text-[var(--text-3)] font-normal">
            (max {formatCurrency(outstandingOf(payTarget))})
          </span>
        </p>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          max={outstandingOf(payTarget)}
          bind:value={payAmount}
        />
      </div>

      <div>
        <p class="input-label mb-1.5">Received into</p>
        <select class="input" bind:value={payDestination}>
          <option value="counter">Counter (cash drawer)</option>
          <option value="bank">Bank (UPI / card)</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <p class="input-label mb-1.5">Notes <span class="text-[var(--text-3)] font-normal">(optional)</span></p>
        <Input bind:value={payNotes} placeholder="e.g. partial payment via UPI" />
      </div>
    </div>
  {/if}
  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => (showPay = false)} class="flex-1 justify-center">
        Cancel
      </Button>
      <Button
        loading={paying}
        disabled={!payAmount || parseFloat(payAmount) <= 0}
        onclick={submitPayment}
        class="flex-1 justify-center"
      >
        Record payment
      </Button>
    </div>
  {/snippet}
</Sheet>
