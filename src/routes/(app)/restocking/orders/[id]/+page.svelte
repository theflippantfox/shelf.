<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { page } from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';
  import { Wallet, Building2, Hourglass, Undo2, CreditCard } from 'lucide-svelte';

  let order = $state(null);
  let payments = $state<any[]>([]);
  let loading  = $state(true);

  // Record-payment sheet
  let payOpen    = $state(false);
  let payAmount  = $state(0);
  let payMethod  = $state<'cash' | 'bank' | 'credit' | 'adjustment'>('cash');
  let payNotes   = $state('');
  let paySaving  = $state(false);

  onMount(async () => {
    try {
      await Promise.all([loadOrder(), loadPayments()]);
    } finally {
      loading = false;
    }
  });

  async function loadOrder() {
    try {
      order = await api('GET', `/api/purchase-orders/${$page.params.id}`);
    } catch (e) {
      toasts.error('Failed to load purchase order');
    }
  }
  async function loadPayments() {
    try {
      const res = await api('GET', `/api/purchase-orders/${$page.params.id}/payments`);
      payments = res.payments ?? [];
    } catch (e) {
      toasts.error('Failed to load payments');
    }
  }

  function openPaySheet() {
    payAmount = remaining;
    payMethod = 'cash';
    payNotes  = '';
    payOpen   = true;
  }

  async function submitPayment() {
    if (!payAmount || payAmount <= 0) {
      toasts.error('Enter a positive amount');
      return;
    }
    if (payAmount > remaining + 0.005) {
      toasts.error(`Amount exceeds remaining ${formatCurrency(remaining)}`);
      return;
    }
    paySaving = true;
    try {
      await api('POST', `/api/purchase-orders/${$page.params.id}/payments`, {
        amount: payAmount,
        method: payMethod,
        notes:  payNotes || null,
        client_request_id: crypto.randomUUID(),   // dedupe retries
      });
      toasts.success(`Payment recorded: ${formatCurrency(payAmount)}`);
      payOpen = false;
      await loadPayments();
      await loadOrder();    // status may have flipped
    } catch (e: any) {
      toasts.error(e?.message ?? 'Failed to record payment');
    } finally {
      paySaving = false;
    }
  }

  // ── derived ────────────────────────────────────────────────
  const paidSoFar = $derived(payments.reduce((s, p) => s + Number(p.amount ?? 0), 0));
  const total     = $derived(Number(order?.total_cost ?? 0));
  const remaining = $derived(Math.max(0, total - paidSoFar));
  const isPaidInFull = $derived(remaining < 0.005);

  const methodLabel: Record<string, string> = {
    cash:      'Cash',
    bank:      'Bank / UPI',
    credit:    'On credit (we owe supplier)',
    adjustment:'Adjustment / write-off',
  };
  const methodIcon: Record<string, any> = {
    cash: Wallet, bank: Building2, credit: Hourglass, adjustment: Undo2,
  };
  const methodColor: Record<string, string> = {
    cash:      'text-[var(--success)]',
    bank:      'text-[var(--primary)]',
    credit:    'text-[var(--warning)]',
    adjustment:'text-[var(--text-3)]',
  };
</script>

<div class="page-header">
  <div class="flex-1">
    <p class="text-base font-semibold">Purchase Order</p>
    <p class="text-xs text-[var(--text-3)]">{order?.order_ref || 'Loading...'}</p>
  </div>
  <Button variant="ghost" href="/restocking" size="sm">Back to Dashboard</Button>
</div>

<div class="max-w-4xl mx-auto p-4 space-y-6">
  {#if loading}
    <div class="flex justify-center p-12">
      <span class="animate-spin">🌀</span>
    </div>
  {:else if order}
    <div class="surface-card p-5 md:p-6 space-y-6">
      <div class="flex justify-between items-start">
        <div>
          <div class="text-3xl font-bold">{order.supplier?.name || 'Unknown Supplier'}</div>
          <div class="text-sm text-muted-foreground">Placed on {order.order_date}</div>
        </div>
        <div class="text-right">
          <div class="px-3 py-1 rounded-full text-xs font-bold uppercase {
            order.status === 'received' ? 'bg-green-500/20 text-green-500' :
            order.status === 'partial' ? 'bg-yellow-500/20 text-yellow-500' :
            'bg-blue-500/20 text-blue-500'
          }">
            {order.status}
          </div>
          <div class="text-2xl font-bold mt-2">{formatCurrency(total)}</div>
        </div>
      </div>

      <!-- Payment summary -->
      <div class="rounded-xl p-4 grid grid-cols-3 gap-3 text-center"
           style="background:color-mix(in srgb, var(--primary) 4%, var(--surface))">
        <div>
          <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">Total</p>
          <p class="text-base font-semibold mt-0.5 tabular-nums">{formatCurrency(total)}</p>
        </div>
        <div>
          <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">Paid</p>
          <p class="text-base font-semibold mt-0.5 tabular-nums" style="color:var(--success)">
            {formatCurrency(paidSoFar)}
          </p>
        </div>
        <div>
          <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">
            {isPaidInFull ? 'Settled' : 'Owed'}
          </p>
          <p class="text-base font-semibold mt-0.5 tabular-nums"
             style="color:{isPaidInFull ? 'var(--success)' : 'var(--danger)'}">
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-muted-foreground text-xs uppercase font-bold">Expected Delivery</div>
          <div>{order.expected_delivery_date || 'Not specified'}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs uppercase font-bold">Received Date</div>
          <div>{order.received_date || 'Not yet received'}</div>
        </div>
      </div>

      <div class="border-t border-[var(--border)] pt-6">
        <h3 class="font-semibold mb-4 text-sm">Items</h3>
        <table class="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th class="text-center">Ordered</th>
              <th class="text-center">Received</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {#each order.items as item}
              <tr>
                <td>
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold">{item.product_name}</span>
                    <span class="text-[10px] text-[var(--text-3)]">{item.product_sku}</span>
                  </div>
                </td>
                <td class="text-center text-xs">{item.quantity_ordered}</td>
                <td class="text-center text-xs">{item.quantity_received}</td>
                <td class="text-right text-xs">{formatCurrency(item.unit_cost)}</td>
                <td class="text-right font-medium text-xs">{formatCurrency(item.line_total)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Payment history -->
      {#if payments.length}
        <div class="border-t border-[var(--border)] pt-6">
          <h3 class="font-semibold mb-3 text-sm">Payment history</h3>
          <ul class="space-y-1.5">
            {#each payments as p}
              {@const Icon = methodIcon[p.method] ?? CreditCard}
              <li class="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                  style="background:var(--surface2)">
                <Icon size={16} strokeWidth={2} class="shrink-0 {methodColor[p.method]}" />
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] font-semibold">
                    {methodLabel[p.method] ?? p.method}
                    {#if p.notes}
                      <span class="font-normal text-[var(--text-3)]">— {p.notes}</span>
                    {/if}
                  </p>
                  <p class="text-[10px] text-[var(--text-3)]">
                    {new Date(p.paid_at).toLocaleString()}
                  </p>
                </div>
                <p class="text-[13px] font-bold tabular-nums" style="color:var(--success)">
                  {formatCurrency(Number(p.amount))}
                </p>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if order.notes}
        <div class="bg-muted/50 p-4 rounded-lg text-xs italic text-muted-foreground">
          "{order.notes}"
        </div>
      {/if}

      <div class="flex justify-end gap-3 pt-6">
        {#if !isPaidInFull}
          <Button variant="primary" onclick={openPaySheet}>
            <Wallet size={14} strokeWidth={2} /> Record payment
          </Button>
        {/if}
        {#if order.status !== 'received'}
          <Button variant="secondary" href="/restocking/orders/{order.id}/receive">
            Receive Delivery
          </Button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="text-center p-12">
      <p class="text-muted-foreground">Order not found</p>
      <Button variant="ghost" href="/restocking" class="mt-4">Return to Dashboard</Button>
    </div>
  {/if}
</div>

<!-- ── Record payment sheet ─────────────────────────────────────── -->
<Sheet bind:open={payOpen} title="Record payment to supplier" maxWidth="max-w-md">
  <div class="space-y-4">
    <div class="rounded-xl p-3 grid grid-cols-2 gap-2 text-center text-[11px]"
         style="background:var(--surface2)">
      <div>
        <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">Owed</p>
        <p class="text-base font-semibold tabular-nums" style="color:var(--danger)">
          {formatCurrency(remaining)}
        </p>
      </div>
      <div>
        <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">Order total</p>
        <p class="text-base font-semibold tabular-nums">{formatCurrency(total)}</p>
      </div>
    </div>

    <div>
      <label for="pay-amount" class="input-label">Amount (₹)</label>
      <div class="flex gap-1.5">
        <input
          id="pay-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={remaining}
          class="input flex-1"
          bind:value={payAmount}
        />
        <Button variant="secondary" size="sm" onclick={() => (payAmount = remaining)}>Max</Button>
        <Button variant="secondary" size="sm" onclick={() => (payAmount = Math.round(remaining / 2 * 100) / 100)}>Half</Button>
        <Button variant="secondary" size="sm" onclick={() => (payAmount = 0)}>Clear</Button>
      </div>
    </div>

    <div>
      <span class="input-label">Paid from</span>
      <div class="grid grid-cols-2 gap-1.5 mt-1">
        {#each [
          { v: 'cash',       label: 'Cash drawer',     icon: Wallet,    hint: 'From the counter' },
          { v: 'bank',       label: 'Bank / UPI',      icon: Building2, hint: 'Online transfer' },
          { v: 'credit',     label: 'On credit',       icon: Hourglass, hint: 'We owe supplier' },
          { v: 'adjustment', label: 'Adjustment',      icon: Undo2,     hint: 'Write-off / dispute' },
        ] as opt}
          {@const selected = payMethod === opt.v}
          <button
            type="button"
            class="rounded-lg p-2.5 text-left transition-all border"
            class:border-[var(--primary)]={selected}
            class:bg-[var(--primary)]={selected}
            style={selected
              ? 'color:var(--primary-fg); border-color:var(--primary)'
              : 'background:var(--surface2); border-color:var(--border)'}
            onclick={() => (payMethod = opt.v)}
          >
            <p class="text-[11.5px] font-semibold flex items-center gap-1.5">
              <opt.icon size={13} strokeWidth={2} />
              {opt.label}
            </p>
            <p class="text-[10px] mt-0.5"
               style={selected ? 'color:color-mix(in srgb, var(--primary-fg) 70%, transparent)'
                                : 'color:var(--text-3)'}>
              {opt.hint}
            </p>
          </button>
        {/each}
      </div>
    </div>

    <div>
      <label for="pay-notes" class="input-label">Notes (optional)</label>
      <textarea
        id="pay-notes"
        class="input"
        rows="2"
        maxlength="200"
        placeholder="e.g. paid via cheque #1234"
        bind:value={payNotes}
      ></textarea>
    </div>

    {#if payMethod === 'cash' || payMethod === 'bank'}
      <p class="text-[10.5px] text-[var(--text-3)] italic">
        A negative entry will be written to the {payMethod === 'cash' ? 'cash drawer' : 'bank'}
        so the register balance reflects the money going out.
      </p>
    {:else if payMethod === 'credit'}
      <p class="text-[10.5px] text-[var(--text-3)] italic">
        The supplier's outstanding balance will increase by {formatCurrency(payAmount ?? 0)}.
        Nothing hits the cash register.
      </p>
    {:else}
      <p class="text-[10.5px] text-[var(--text-3)] italic">
        No register entry. Used for write-offs / disputes / corrections.
      </p>
    {/if}

    <div class="flex gap-2 pt-1">
      <Button variant="secondary" onclick={() => (payOpen = false)} class="flex-1">
        Cancel
      </Button>
      <Button variant="primary" loading={paySaving} onclick={submitPayment} class="flex-1">
        <Wallet size={14} strokeWidth={2} /> Record payment
      </Button>
    </div>
  </div>
</Sheet>
