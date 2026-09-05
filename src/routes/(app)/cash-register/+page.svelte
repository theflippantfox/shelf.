<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { register as regStore } from '$lib/stores/register.svelte';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Button     from '$lib/components/ui/Button.svelte';
  import Sheet      from '$lib/components/ui/Sheet.svelte';
  import Input      from '$lib/components/ui/Input.svelte';
  import { formatDateTime } from '$lib/utils/format';
  import {
    Plus, TrendingUp, TrendingDown, ArrowLeftRight, Ban,
    ShoppingCart, Wallet, Building2, Box, Clock,
  } from 'lucide-svelte';

  let { data } = $props();

  // Seed the register store from the server data. After that, all
  // reads (balance, grouped history, outstanding credit) come from
  // the store so manual entries, transfers, and voids show up
  // instantly without a server round-trip.
  $effect(() => { regStore.replaceAll(
    (data.entries ?? []) as any[],
    (data.credit?.total ?? 0) as number,
  ); });

  type Entry = {
    id: string;
    destination: 'counter' | 'bank' | 'other';
    amount: number;
    entry_type: 'sale' | 'expense' | 'injection' | 'adjustment' | 'transfer' | 'void';
    source: 'sale' | 'void' | 'manual' | 'transfer';
    sale_id: string | null;
    transfer_group_id: string | null;
    notes: string;
    created_by: string;
    created_at: string;
    effective_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    created_by_profile?: { first_name?: string; last_name?: string } | null;
  };

  // ── Sheet: new manual entry ──────────────────────────────────────────
  let showSheet = $state(false);
  let sheetTab = $state<'expense' | 'injection' | 'transfer'>('expense');
  let sheetDestination = $state<'counter' | 'bank' | 'other'>('counter');
  let sheetAmount = $state('');
  let sheetNotes = $state('');
  let sheetTransferTo = $state<'counter' | 'bank' | 'other'>('bank');
  let sheetSubmitting = $state(false);

  function openSheet(tab: 'expense' | 'injection' | 'transfer') {
    sheetTab = tab;
    sheetDestination = 'counter';
    sheetTransferTo = tab === 'transfer' ? 'bank' : 'counter';
    sheetAmount = '';
    sheetNotes = '';
    showSheet = true;
  }

  async function submitEntry() {
    if (sheetSubmitting) return;
    const amt = parseFloat(sheetAmount);
    if (isNaN(amt) || amt === 0) {
      toasts.error('Enter a non-zero amount');
      return;
    }

    sheetSubmitting = true;
    const clientId = crypto.randomUUID();
    try {
      // Optimistic: push the entry into the local store immediately
      // so the balance + history update without a server round-trip.
      // The server response (with the real id) replaces the temp row.
      if (sheetTab === 'transfer') {
        const transferGroupId = crypto.randomUUID();
        const signed = Math.abs(amt);
        regStore.add({
          id: clientId,
          client_id: clientId,
          destination: sheetDestination,
          amount: -signed,
          entry_type: 'transfer',
          source: 'manual',
          sale_id: null,
          voided_entry_id: null,
          transfer_group_id: transferGroupId,
          notes: sheetNotes,
          created_at: new Date().toISOString(),
          effective_at: new Date().toISOString(),
          _pending: true,
        });
        regStore.add({
          id: crypto.randomUUID(),
          client_id: crypto.randomUUID(),
          destination: sheetTransferTo,
          amount: signed,
          entry_type: 'transfer',
          source: 'manual',
          sale_id: null,
          voided_entry_id: null,
          transfer_group_id: transferGroupId,
          notes: sheetNotes,
          created_at: new Date().toISOString(),
          effective_at: new Date().toISOString(),
          _pending: true,
        });
        const res = await fetch('/api/cash-register/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sheetDestination,
            to: sheetTransferTo,
            amount: signed,
            notes: sheetNotes,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toasts.error(data.error ?? 'Transfer failed');
          // Rollback: remove the optimistic rows by their client_id.
          regStore.replaceAll((regStore.all as any[]).filter(e => !(e as any)._pending));
          await invalidateAll();
          regStore.replaceAll(
            (data.entries ?? []) as any[],
            (data.credit?.total ?? 0) as number,
          );
          return;
        }
        toasts.success(`Transferred ${formatCurrency(signed)}`);
        // Re-sync from server to get the real ids + per-pair rows.
        await invalidateAll();
      } else {
        const signed = sheetTab === 'expense' ? -Math.abs(amt) : Math.abs(amt);
        regStore.add({
          id: clientId,
          client_id: clientId,
          destination: sheetDestination,
          amount: signed,
          entry_type: sheetTab,
          source: 'manual',
          sale_id: null,
          voided_entry_id: null,
          transfer_group_id: null,
          notes: sheetNotes,
          created_at: new Date().toISOString(),
          effective_at: new Date().toISOString(),
          _pending: true,
        });
        const res = await fetch('/api/cash-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: sheetDestination,
            amount: signed,
            entry_type: sheetTab,
            notes: sheetNotes,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toasts.error(data.error ?? 'Entry failed');
          regStore.replaceAll((regStore.all as any[]).filter(e => !(e as any)._pending));
          await invalidateAll();
          regStore.replaceAll(
            (data.entries ?? []) as any[],
            (data.credit?.total ?? 0) as number,
          );
          return;
        }
        // Reconcile: replace the temp row with the real server row.
        regStore.reconcile(clientId, data);
        toasts.success(
          sheetTab === 'expense' ? `Logged ${formatCurrency(signed)} expense` : `Logged ${formatCurrency(signed)} injection`,
        );
      }
      showSheet = false;
    } finally {
      sheetSubmitting = false;
    }
  }

  // ── Void confirmation ───────────────────────────────────────────────
  let showVoid = $state(false);
  let voidTarget = $state<Entry | null>(null);
  let voidReason = $state('');
  let voiding = $state(false);

  function startVoid(e: Entry) {
    voidTarget = e;
    voidReason = '';
    showVoid = true;
  }
  async function doVoid() {
    if (voiding || !voidTarget || !voidReason.trim()) return;
    voiding = true;
    const res = await fetch(`/api/cash-register/${voidTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ void_reason: voidReason }),
    });
    if (res.ok) {
      toasts.success('Entry voided');
      showVoid = false;
      await invalidateAll();
    } else {
      const data = await res.json();
      toasts.error(data.error ?? 'Void failed');
    }
    voiding = false;
  }

  // ── Display helpers ──────────────────────────────────────────────────
  function destIcon(d: string) {
    if (d === 'counter') return Wallet;
    if (d === 'bank') return Building2;
    return Box;
  }
  function destLabel(d: string) {
    if (d === 'counter') return 'Counter';
    if (d === 'bank') return 'Bank';
    return 'Other';
  }
  function entryIcon(t: string) {
    if (t === 'sale') return ShoppingCart;
    if (t === 'expense') return TrendingDown;
    if (t === 'injection') return TrendingUp;
    if (t === 'transfer') return ArrowLeftRight;
    if (t === 'void') return Ban;
    if (t === 'adjustment') return ArrowLeftRight;
    return ShoppingCart;
  }
  function entryLabel(e: Entry): string {
    if (e.entry_type === 'sale')      return 'Sale';
    if (e.entry_type === 'expense')   return 'Expense';
    if (e.entry_type === 'injection') return 'Injection';
    if (e.entry_type === 'transfer')  return e.notes.includes('(out)') ? 'Transfer out' : 'Transfer in';
    if (e.entry_type === 'void')      return 'Sale void';
    if (e.entry_type === 'adjustment') return 'Adjustment';
    return e.entry_type;
  }
  function amountClass(amt: number) {
    if (amt > 0) return 'text-[var(--teal)]';
    if (amt < 0) return 'text-[var(--crimson)]';
    return '';
  }
  function amountPrefix(amt: number) {
    if (amt > 0) return '+';
    return '';
  }
  function authorName(e: Entry): string {
    const p = e.created_by_profile;
    if (!p) return '';
    return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  }
  function dayLabel(iso: string) {
    const d = new Date(iso);
    const todayIso = new Date().toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (iso === todayIso) return 'Today';
    if (iso === yesterdayIso) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function relativeDay(iso: string) {
    // Lightweight "2h ago" / "Mon" for mobile
    const d = new Date(iso);
    const todayIso = new Date().toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const dIso = d.toISOString().slice(0, 10);
    if (dIso === todayIso) {
      return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (dIso === yesterdayIso) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  // Group entries by day (newest first within each day)
  const groupedByDay = $derived.by(() => {
    const groups: Record<string, any[]> = {};
    for (const e of regStore.all as any[]) {
      const day = (e.effective_at ?? e.created_at).slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  });

  // Daily totals for the headline row
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const todayTotal = $derived(
    (regStore.all as any[])
      .filter((e) => (e.effective_at ?? e.created_at).slice(0, 10) === todayIso)
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  );
  const weekTotal = $derived(
    (regStore.all as any[])
      .filter((e) => (e.effective_at ?? e.created_at).slice(0, 10) >= sevenDaysAgoIso)
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  );
  // Balance is derived from the entries. Same numbers as the server's
  // get_register_balance RPC, but always live (any manual entry shows
  // up here without a refresh).
  const counterBal = $derived(
    (regStore.balance.destinations ?? []).find((d: any) => d.destination === 'counter')?.balance ?? 0,
  );
  const bankBal = $derived(
    (regStore.balance.destinations ?? []).find((d: any) => d.destination === 'bank')?.balance ?? 0,
  );
  const totalBalance = $derived(regStore.balance.total);

  // Role gates
  const role = $derived((auth as any).role as 'owner' | 'manager' | 'cashier' | undefined);
  const canInject = $derived(role === 'owner' || role === 'manager');
  const canTransfer = $derived(role === 'owner' || role === 'manager');
  const canVoid = $derived(role === 'owner' || role === 'manager');
</script>

<svelte:head><title>Cash register · Shëlf</title></svelte:head>

<PageShell>
  <div class="flex flex-col gap-3 md:gap-5">
    <!-- Header — stack on mobile, row on md+ -->
    <div class="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between md:gap-3">
      <div class="min-w-0">
        <h1 class="text-[20px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight leading-tight">
          Cash register
        </h1>
        <p class="text-[11px] md:text-xs text-[var(--text-3)] mt-0.5">
          All money movements in and out of the shop.
        </p>
      </div>

      <!-- Action buttons: full-width on mobile, auto on md+ -->
      <div class="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onclick={() => openSheet('expense')} class="flex-1 md:flex-initial justify-center">
          <TrendingDown size={13} strokeWidth={2} />
          <span class="hidden sm:inline">Expense</span>
          <span class="sm:hidden">Out</span>
        </Button>
        {#if canInject}
          <Button variant="secondary" size="sm" onclick={() => openSheet('injection')} class="flex-1 md:flex-initial justify-center">
            <TrendingUp size={13} strokeWidth={2} />
            <span class="hidden sm:inline">Injection</span>
            <span class="sm:hidden">In</span>
          </Button>
        {/if}
        <Button variant="primary" size="sm" onclick={() => openSheet(canTransfer ? 'transfer' : 'expense')} class="flex-1 md:flex-initial justify-center">
          <Plus size={13} strokeWidth={2.5} />
          <span>New</span>
        </Button>
      </div>
    </div>

    <!-- Total balance — single hero card on mobile, split on md+ -->
    <div class="surface-card p-4">
      <p class="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Total balance</p>
      <p class="text-3xl md:text-4xl font-bold tabular-nums text-[var(--text)] mt-1 leading-none">
        {formatCurrency(totalBalance)}
      </p>

      <!-- Per-destination split — inline on mobile, side-by-side on md+ -->
      <div class="mt-3 grid grid-cols-2 gap-3 md:gap-6">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-[var(--surface2)] flex items-center justify-center shrink-0">
            <Wallet size={14} strokeWidth={1.75} class="text-[var(--text-2)]" />
          </div>
          <div class="min-w-0">
            <p class="text-[10px] text-[var(--text-3)] font-medium leading-tight">Counter</p>
            <p class="text-sm font-semibold tabular-nums text-[var(--text)] leading-tight truncate">
              {formatCurrency(counterBal)}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-[var(--surface2)] flex items-center justify-center shrink-0">
            <Building2 size={14} strokeWidth={1.75} class="text-[var(--text-2)]" />
          </div>
          <div class="min-w-0">
            <p class="text-[10px] text-[var(--text-3)] font-medium leading-tight">Bank</p>
            <p class="text-sm font-semibold tabular-nums text-[var(--text)] leading-tight truncate">
              {formatCurrency(bankBal)}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Headline KPIs — single row, compact on mobile -->
    <div class="grid grid-cols-2 gap-2 md:gap-3">
      <div class="surface-card px-3 py-2.5 md:p-3">
        <p class="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Today</p>
        <p class="text-sm md:text-base font-semibold tabular-nums {amountClass(todayTotal)} mt-0.5 truncate">
          {amountPrefix(todayTotal)}{formatCurrency(todayTotal)}
        </p>
      </div>
      <div class="surface-card px-3 py-2.5 md:p-3">
        <p class="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">Last 7 days</p>
        <p class="text-sm md:text-base font-semibold tabular-nums {amountClass(weekTotal)} mt-0.5 truncate">
          {amountPrefix(weekTotal)}{formatCurrency(weekTotal)}
        </p>
      </div>
    </div>

    <!-- Credit / receivables — separate from the main balance card per
         the design decision. Shows total outstanding + a per-customer
         breakdown. Only renders when there's outstanding credit. -->
    {#if (data.credit?.byCustomer?.length ?? 0) > 0}
      <div class="surface-card p-3.5 md:p-4">
        <div class="flex items-center justify-between mb-2.5">
          <div class="flex items-center gap-1.5">
            <Clock size={13} strokeWidth={2.2} style="color:var(--gold)" />
            <p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Outstanding credit
            </p>
          </div>
          <p class="text-sm font-bold tabular-nums" style="color:var(--gold)">
            {formatCurrency(data.credit.total)}
          </p>
        </div>
        <ul class="space-y-1.5">
          {#each data.credit.byCustomer.slice(0, 5) as c (c.id)}
            <li>
              <a href="/customers/{c.id}"
                 class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface2)] transition-colors">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-[var(--text)] truncate">{c.name}</p>
                  <p class="text-[10px] text-[var(--text-3)]">
                    {c.sales} open {c.sales === 1 ? 'sale' : 'sales'}
                  </p>
                </div>
                <p class="text-xs font-bold tabular-nums whitespace-nowrap" style="color:var(--gold)">
                  {formatCurrency(c.outstanding)}
                </p>
              </a>
            </li>
          {/each}
          {#if data.credit.byCustomer.length > 5}
            <li class="text-[10px] text-[var(--text-3)] text-center pt-1">
              +{data.credit.byCustomer.length - 5} more
            </li>
          {/if}
        </ul>
      </div>
    {/if}

    <!-- History grouped by day -->
    {#if groupedByDay.length === 0}
      <EmptyState
        title="No entries yet"
        description="Sales auto-add here. Use the buttons above to log an expense, injection, or transfer."
        icon="Wallet"
      />
    {:else}
      <div class="flex flex-col gap-3">
        {#each groupedByDay as [day, entries] (day)}
          <div>
            <div class="flex items-center justify-between mb-1 px-1">
              <p class="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-3)]">
                {dayLabel(day)}
              </p>
              <p class="text-[10px] tabular-nums text-[var(--text-3)] font-semibold">
                {formatCurrency(entries.reduce((s, e) => s + e.amount, 0))}
              </p>
            </div>
            <div class="surface-card overflow-hidden">
              <ul class="divide-y divide-[var(--border)]">
                {#each entries as e (e.id)}
                  {@const Icon = entryIcon(e.entry_type)}
                  {@const DIcon = destIcon(e.destination)}
                  <li class="px-3 py-2.5 flex items-start gap-2.5 md:gap-3">
                    <!-- Type icon -->
                    <div class="w-8 h-8 rounded-full bg-[var(--surface2)] flex items-center justify-center shrink-0">
                      <Icon size={14} strokeWidth={1.75} class="text-[var(--text-2)]" />
                    </div>

                    <!-- Middle: label + meta -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <p class="text-xs font-semibold truncate">{entryLabel(e)}</p>
                        <span class="text-[10px] text-[var(--text-3)] flex items-center gap-0.5 shrink-0">
                          <DIcon size={9} strokeWidth={2.5} />
                          <span class="hidden sm:inline">{destLabel(e.destination)}</span>
                        </span>
                      </div>
                      {#if e.notes}
                        <p class="text-[11px] text-[var(--text-3)] mt-0.5 line-clamp-2 break-words">{e.notes}</p>
                      {/if}
                      <p class="text-[10px] text-[var(--text-3)] mt-0.5">
                        <span class="sm:hidden">{relativeDay(e.effective_at ?? e.created_at)}</span>
                        <span class="hidden sm:inline">{formatDateTime(e.effective_at ?? e.created_at)}</span>
                        {#if authorName(e)}<span class="hidden sm:inline"> · {authorName(e)}</span>{/if}
                      </p>
                    </div>

                    <!-- Right: amount + void -->
                    <div class="flex flex-col items-end gap-0.5 shrink-0">
                      <p class="text-sm font-semibold tabular-nums {amountClass(e.amount)} whitespace-nowrap">
                        {amountPrefix(e.amount)}{formatCurrency(e.amount)}
                      </p>
                      {#if e.source === 'manual' && canVoid}
                        <button
                          class="text-[10px] text-[var(--text-3)] underline hover:text-[var(--crimson)]"
                          onclick={() => startVoid(e)}
                        >
                          void
                        </button>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</PageShell>

<!-- ── New entry sheet ────────────────────────────────────────────────── -->
<Sheet bind:open={showSheet} title="New cash register entry" maxWidth="max-w-md">
  <div class="flex flex-col gap-4">
    <!-- Tab chooser -->
    <div class="flex gap-1 p-1 rounded-lg bg-[var(--surface2)]">
      <button
        class="flex-1 px-2 py-2 text-xs font-semibold rounded-md transition {sheetTab === 'expense' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)]'}"
        onclick={() => sheetTab = 'expense'}
      >
        Expense
      </button>
      {#if canInject}
        <button
          class="flex-1 px-2 py-2 text-xs font-semibold rounded-md transition {sheetTab === 'injection' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)]'}"
          onclick={() => sheetTab = 'injection'}
        >
          Injection
        </button>
      {/if}
      {#if canTransfer}
        <button
          class="flex-1 px-2 py-2 text-xs font-semibold rounded-md transition {sheetTab === 'transfer' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)]'}"
          onclick={() => sheetTab = 'transfer'}
        >
          Transfer
        </button>
      {/if}
    </div>

    <!-- Destination(s) -->
    {#if sheetTab === 'transfer'}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <p class="input-label mb-1.5">From</p>
          <select class="input" bind:value={sheetDestination}>
            <option value="counter">Counter</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <p class="input-label mb-1.5">To</p>
          <select class="input" bind:value={sheetTransferTo}>
            <option value="counter">Counter</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
    {:else}
      <div>
        <p class="input-label mb-1.5">Destination</p>
        <select class="input" bind:value={sheetDestination}>
          <option value="counter">Counter (cash drawer)</option>
          <option value="bank">Bank (UPI / card)</option>
          <option value="other">Other</option>
        </select>
      </div>
    {/if}

    <!-- Amount -->
    <div>
      <p class="input-label mb-1.5">
        Amount
        {#if sheetTab === 'expense'}
          <span class="text-[var(--text-3)] font-normal">(recorded as negative)</span>
        {:else if sheetTab === 'injection'}
          <span class="text-[var(--text-3)] font-normal">(recorded as positive)</span>
        {:else}
          <span class="text-[var(--text-3)] font-normal">(positive)</span>
        {/if}
      </p>
      <Input
        type="number"
        step="0.01"
        min="0.01"
        bind:value={sheetAmount}
        placeholder="0.00"
      />
    </div>

    <!-- Notes -->
    <div>
      <p class="input-label mb-1.5">
        Notes
        <span class="text-[var(--text-3)] font-normal">
          ({sheetTab === 'expense' ? 'what was this for' : sheetTab === 'injection' ? 'source of funds' : 'optional'})
        </span>
      </p>
      <Input bind:value={sheetNotes} placeholder={sheetTab === 'expense' ? 'e.g. Rent for September' : sheetTab === 'injection' ? 'e.g. Owner added capital' : 'e.g. Bank deposit'} />
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (showSheet = false)} class="flex-1 justify-center">
        Cancel
      </Button>
      <Button
        variant="primary"
        onclick={submitEntry}
        disabled={sheetSubmitting || !sheetAmount}
        class="flex-1 justify-center"
      >
        {sheetSubmitting ? 'Saving…' : 'Save entry'}
      </Button>
    </div>
  </div>
</Sheet>

<!-- ── Void confirmation ─────────────────────────────────────────────── -->
<Sheet bind:open={showVoid} title="Void entry" maxWidth="max-w-sm">
  <div class="flex flex-col gap-4">
    {#if voidTarget}
      <p class="text-sm text-[var(--text-2)]">
        Void this {voidTarget.entry_type} of {formatCurrency(Math.abs(voidTarget.amount))} on
        {' '}{destLabel(voidTarget.destination)}?
        The amount will be subtracted from the running balance.
      </p>
    {/if}
    <div>
      <p class="input-label mb-1.5">Reason <span class="text-[var(--crimson)]">*</span></p>
      <Input bind:value={voidReason} placeholder="e.g. duplicate entry" />
    </div>
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => (showVoid = false)} class="flex-1 justify-center">
        Cancel
      </Button>
      <Button variant="danger" onclick={doVoid} disabled={voiding || !voidReason.trim()} class="flex-1 justify-center">
        {voiding ? 'Voiding…' : 'Void entry'}
      </Button>
    </div>
  </div>
</Sheet>
