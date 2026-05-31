<script lang="ts">
  import { goto }         from '$app/navigation';
  import { cart, type PaymentMethod, type DiscountType } from '$lib/stores/cart.svelte';
  import { toasts }       from '$lib/stores/toast.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import SearchBar  from '$lib/components/ui/SearchBar.svelte';
  import Button     from '$lib/components/ui/Button.svelte';
  import Modal      from '$lib/components/ui/Modal.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { ShoppingCart, Trash2, User, Tag, ChevronDown, ChevronUp, Plus, Minus, Banknote, CreditCard, ArrowLeftRight, X } from 'lucide-svelte';

  let { data } = $props();

  let search      = $state('');
  let filterCat   = $state('');
  let cartOpen    = $state(false);
  let showCheckout = $state(false);
  let submitting  = $state(false);
  let showReceipt = $state(false);
  let lastSaleRef = $state('');
  let discountStr = $state('');
  let customerSearch = $state('');
  let showCustPicker = $state(false);

  const products = $derived(() => {
    let list = data.products as any[];
    if (filterCat) list = list.filter(p => (p.category?.id ?? p.category) === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    return list;
  });

  const filteredCustomers = $derived(() => {
    if (!customerSearch) return (data.customers as any[]).slice(0, 8);
    const q = customerSearch.toLowerCase();
    return (data.customers as any[]).filter(c => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  });

  // Tax calc
  const taxAmount = $derived(() => {
    const rate = (data.taxRate ?? 0) / 10000; // basis points → decimal
    if (data.taxInclusive) return Math.round(cart.total * rate / (1 + rate));
    return Math.round(cart.total * rate);
  });

  const grandTotal = $derived(() =>
    data.taxInclusive ? cart.total : cart.total + taxAmount()
  );

  function applyDiscount() {
    const v = parseFloat(discountStr);
    if (isNaN(v)) return;
    const type: DiscountType = discountStr.includes('%') ? 'percent' : 'amount';
    const val = type === 'amount' ? Math.round(v * 100) : v;
    cart.setDiscount(type, val);
  }

  async function submitSale() {
    if (cart.isEmpty) return;
    submitting = true;
    const res = await fetch('/api/sales', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items:           cart.items,
        customer_id:     cart.customerId,
        discount_type:   cart.discountType,
        discount_value:  cart.discountValue,
        discount_amount: cart.discountAmount,
        subtotal:        cart.subtotal,
        total:           grandTotal(),
        tax_amount:      taxAmount(),
        payment_method:  cart.paymentMethod,
        notes:           cart.notes,
      }),
    });
    const data2 = await res.json();
    if (res.ok) {
      lastSaleRef  = data2.sale_ref;
      showCheckout = false;
      showReceipt  = true;
      cart.clear();
    } else {
      toasts.error(data2.error ?? 'Sale failed');
    }
    submitting = false;
  }

  const payIcons: Record<PaymentMethod, typeof Banknote> = {
    cash: Banknote, credit: CreditCard, transfer: ArrowLeftRight,
  };
</script>

<svelte:head><title>New Sale · Shëlf</title></svelte:head>

<PageShell>
  <!-- Product search + category filter -->
  <div class="flex gap-2 mb-3">
    <SearchBar bind:value={search} placeholder="Search products…" class="flex-1" />
    {#if cart.count > 0}
      <button class="btn btn-primary btn-sm relative" onclick={() => cartOpen = !cartOpen}>
        <ShoppingCart size={15} strokeWidth={1.75} />
        <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[var(--primary)] text-[9px] font-bold flex items-center justify-center">{cart.count}</span>
      </button>
    {/if}
  </div>

  <!-- Category pills -->
  <div class="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
    <button
      class="btn btn-sm flex-shrink-0 {filterCat==='' ? 'btn-primary' : 'btn-secondary'}"
      onclick={() => filterCat = ''}
    >All</button>
    {#each data.categories as cat}
      <button
        class="btn btn-sm flex-shrink-0 gap-1 {filterCat===cat.id ? 'btn-primary' : 'btn-secondary'}"
        onclick={() => filterCat = filterCat === (cat as any).id ? '' : (cat as any).id}
      >
        <DynamicIcon name={(cat as any).icon} size={12} />
        {(cat as any).name}
      </button>
    {/each}
  </div>

  <!-- Products grid -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each products() as p}
      <button
        class="card p-3 text-left transition-all active:scale-95 hover:border-[var(--primary)]"
        onclick={() => { cart.add(p as any); if (!cartOpen && cart.count === 1) toasts.success(`${(p as any).name} added`); }}
        disabled={(p as any).qty === 0}
      >
        <div class="w-8 h-8 rounded-lg mb-2 flex items-center justify-center"
             style="background:color-mix(in srgb,{(p as any).category?.color ?? 'var(--primary)'} 15%,transparent)">
          <DynamicIcon name={(p as any).category?.icon ?? 'Package'} size={15}
                       style="color:{(p as any).category?.color ?? 'var(--primary)'}" />
        </div>
        <p class="text-xs font-semibold leading-tight mb-0.5 line-clamp-2">{(p as any).name}</p>
        <p class="text-[10px] text-[var(--text-3)]">{(p as any).sku}</p>
        <div class="flex items-end justify-between mt-2">
          <p class="text-sm font-semibold">{formatCurrency((p as any).price)}</p>
          <span class="text-[10px] text-[var(--text-3)]">{(p as any).qty}</span>
        </div>
      </button>
    {/each}
  </div>

  <!-- Cart padding -->
  {#if cart.count > 0}
    <div class="h-24"></div>
  {/if}
</PageShell>

<!-- Floating cart sheet -->
{#if cartOpen && cart.count > 0}
  <div class="cart-sheet">
    <!-- Handle -->
    <button class="w-10 h-1 rounded-full bg-[var(--border)] mx-auto mt-3 mb-0 block" onclick={() => cartOpen = false}></button>
    <div class="flex items-center justify-between px-5 pt-3 pb-2 border-b border-[var(--border)]">
      <p class="text-sm font-semibold">Cart ({cart.count})</p>
      <button class="btn btn-ghost btn-icon btn-sm" onclick={() => cartOpen = false}><X size={16} strokeWidth={1.75} /></button>
    </div>
    <div class="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
      {#each cart.items as item}
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold truncate">{item.name}</p>
            <p class="text-[10px] text-[var(--text-3)]">{formatCurrency(item.unitPrice)} each</p>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => cart.setQty(item.productId, item.qty - 1)}><Minus size={13} strokeWidth={2} /></button>
            <span class="text-xs font-semibold w-4 text-center">{item.qty}</span>
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => cart.setQty(item.productId, item.qty + 1)}><Plus size={13} strokeWidth={2} /></button>
          </div>
          <p class="text-xs font-semibold w-16 text-right">{formatCurrency(item.unitPrice * item.qty)}</p>
          <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => cart.remove(item.productId)}><Trash2 size={13} strokeWidth={1.75} /></button>
        </div>
      {/each}
    </div>
    <div class="p-4 border-t border-[var(--border)]">
      <div class="flex justify-between text-xs mb-1">
        <span class="text-[var(--text-3)]">Subtotal</span>
        <span>{formatCurrency(cart.subtotal)}</span>
      </div>
      {#if cart.discountAmount > 0}
        <div class="flex justify-between text-xs mb-1 text-[var(--teal-fg)]">
          <span>Discount</span>
          <span>– {formatCurrency(cart.discountAmount)}</span>
        </div>
      {/if}
      {#if data.taxRate > 0}
        <div class="flex justify-between text-xs mb-1 text-[var(--text-3)]">
          <span>{data.taxName}</span>
          <span>{formatCurrency(taxAmount())}</span>
        </div>
      {/if}
      <div class="flex justify-between font-semibold text-sm mb-3">
        <span>Total</span>
        <span>{formatCurrency(grandTotal())}</span>
      </div>
      <Button onclick={() => { cartOpen = false; showCheckout = true; }} class="w-full justify-center">
        Proceed to checkout
      </Button>
    </div>
  </div>
{/if}

<!-- Cart FAB (when cart closed) -->
{#if !cartOpen && cart.count > 0}
  <div class="fixed bottom-24 md:bottom-6 right-4 z-30">
    <button class="btn btn-primary btn-lg rounded-full shadow-[var(--shadow-lg)] gap-2 relative"
            onclick={() => cartOpen = true}>
      <ShoppingCart size={18} strokeWidth={1.75} />
      {formatCurrency(grandTotal())}
      <span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white text-[var(--primary)] text-[10px] font-bold flex items-center justify-center">{cart.count}</span>
    </button>
  </div>
{/if}

<!-- Checkout modal -->
<Modal bind:open={showCheckout} title="Complete sale" maxWidth="max-w-sm">
  <div class="flex flex-col gap-4">
    <!-- Customer -->
    <div>
      <p class="input-label mb-1.5">Customer (optional)</p>
      {#if cart.customerId}
        <div class="flex items-center gap-2 p-2 bg-[var(--surface2)] rounded-lg">
          <User size={14} strokeWidth={1.75} class="text-[var(--primary)]" />
          <span class="text-xs flex-1">{cart.customerName}</span>
          <button class="btn btn-ghost btn-icon btn-sm" onclick={() => cart.setCustomer(null,'')}>
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      {:else}
        <div class="relative">
          <SearchBar bind:value={customerSearch} placeholder="Search customer…" oninput={() => showCustPicker = true} />
          {#if showCustPicker && filteredCustomers().length > 0}
            <div class="absolute top-full left-0 right-0 mt-1 card z-10 max-h-40 overflow-y-auto">
              {#each filteredCustomers() as c}
                <button class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface2)]"
                  onclick={() => { cart.setCustomer((c as any).id, (c as any).name); customerSearch = ''; showCustPicker = false; }}>
                  {(c as any).name} · {(c as any).phone ?? ''}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Discount -->
    <div>
      <p class="input-label mb-1.5">Discount</p>
      <div class="flex gap-2">
        <input bind:value={discountStr} placeholder="e.g. 500 or 10%" class="input text-sm flex-1"
               oninput={applyDiscount} />
        <button class="btn btn-secondary btn-sm" onclick={() => { discountStr = ''; cart.setDiscount('amount',0); }}>
          Clear
        </button>
      </div>
    </div>

    <!-- Payment method -->
    <div>
      <p class="input-label mb-1.5">Payment method</p>
      <div class="grid grid-cols-3 gap-2">
        {#each ['cash','credit','transfer'] as m}
          {@const Icon = payIcons[m as PaymentMethod]}
          <button
            class="py-2 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 capitalize transition-colors"
            style="background:{cart.paymentMethod===m?'var(--primary)':'var(--surface2)'};color:{cart.paymentMethod===m?'#fff':'var(--text-2)'};border-color:{cart.paymentMethod===m?'var(--primary)':'var(--border)'}"
            onclick={() => cart.setPaymentMethod(m as PaymentMethod)}
          >
            <Icon size={16} strokeWidth={1.75} />{m}
          </button>
        {/each}
      </div>
    </div>

    <!-- Order summary -->
    <div class="bg-[var(--surface2)] rounded-xl p-3 text-xs flex flex-col gap-1">
      <div class="flex justify-between"><span class="text-[var(--text-3)]">Subtotal</span><span>{formatCurrency(cart.subtotal)}</span></div>
      {#if cart.discountAmount > 0}
        <div class="flex justify-between text-[var(--teal-fg)]"><span>Discount</span><span>– {formatCurrency(cart.discountAmount)}</span></div>
      {/if}
      {#if data.taxRate > 0}
        <div class="flex justify-between text-[var(--text-3)]"><span>{data.taxName}</span><span>{formatCurrency(taxAmount())}</span></div>
      {/if}
      <div class="flex justify-between font-semibold text-sm border-t border-[var(--border)] mt-1 pt-1">
        <span>Total</span><span>{formatCurrency(grandTotal())}</span>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => showCheckout = false} class="flex-1 justify-center">Back</Button>
      <Button loading={submitting} onclick={submitSale} class="flex-1 justify-center">Complete Sale</Button>
    </div>
  {/snippet}
</Modal>

<!-- Receipt modal -->
<Modal bind:open={showReceipt} title="Sale complete 🎉" maxWidth="max-w-sm">
  <div class="text-center py-4">
    <div class="w-14 h-14 rounded-full bg-[var(--teal-dim)] flex items-center justify-center mx-auto mb-4">
      <svg class="text-[var(--teal)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    </div>
    <p class="font-semibold mb-1">Sale recorded</p>
    <p class="text-xs text-[var(--text-3)]">Ref: {lastSaleRef}</p>
  </div>
  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => { showReceipt = false; }} class="flex-1 justify-center">Done</Button>
      <Button onclick={() => { showReceipt = false; goto(`/history`); }} class="flex-1 justify-center">View receipt</Button>
    </div>
  {/snippet}
</Modal>
