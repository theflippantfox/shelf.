<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    cart,
    type PaymentMethod,
    type DiscountType,
  } from "$lib/stores/cart.svelte";
  import { toasts } from "$lib/stores/toast.svelte";
  import { formatCurrency, formatCurrencyCompact } from "$lib/utils/format";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import {
    ShoppingCart, Trash2, User, Plus, Minus,
    Banknote, CreditCard, ArrowLeftRight, X,
    Search, Check, ChevronRight, Package,
  } from "lucide-svelte";

  let { data } = $props();

  /* ── UI state ──────────────────────────────────────────────────────────── */
  let search        = $state("");
  let filterCat     = $state("");
  let cartOpen      = $state(false);
  let showCheckout  = $state(false);
  let submitting    = $state(false);
  let showReceipt   = $state(false);
  let lastSaleRef   = $state("");
  let lastSaleTotal = $state(0);
  let lastSaleMethod = $state<PaymentMethod>('cash');
  let lastSaleCustomer = $state<string>('');
  let discountStr   = $state("");
  let customerSearch = $state("");
  let showCustPicker = $state(false);

  const saleId = $derived(page.url.searchParams.get("id"));
  const isEdit = $derived(page.url.searchParams.get("mode") === "edit");

  /* ── Edit-mode preload ─────────────────────────────────────────────────── */
  $effect(() => {
    if (isEdit && (data as any).editSale && (data as any).editItems) {
      cart.loadFromSale((data as any).editSale, (data as any).editItems);
      if ((data as any).editSale.customer?.name) {
        cart.setCustomer((data as any).editSale.customer.id, (data as any).editSale.customer.name);
      }
      const sale = (data as any).editSale;
      discountStr = sale.discount_type === 'percent'
        ? `${sale.discount_value}%`
        : `${(sale.discount_value / 100).toFixed(2)}`;
    }
  });

  /* ── Derived: filtered products ────────────────────────────────────────── */
  /**
   * FIX: was `const products = $derived(() => {...})` which made `products` a
   * function whose inner body never re-executed (same bug as inventory). Use
   * `$derived.by` so the body actually runs reactively.
   */
  const products = $derived.by(() => {
    let list = data.products as any[];
    if (filterCat) {
      list = list.filter(p => (p.category?.id ?? p.category) === filterCat);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  });

  /** Index for quick lookup of cart-quantity by product id (for the +/- steppers) */
  const cartByProduct = $derived.by(() => {
    const map = new Map<string, number>();
    for (const item of cart.items) map.set(item.productId, item.qty);
    return map;
  });

  /* ── Derived: filtered customers ───────────────────────────────────────── */
  const filteredCustomers = $derived.by(() => {
    const list = data.customers as any[];
    if (!customerSearch.trim()) return list.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  });

  /* ── Derived: tax + total ──────────────────────────────────────────────── */
  const taxAmount = $derived.by(() => {
    const rate = (data.taxRate ?? 0) / 10000;
    if (!rate) return 0;
    return data.taxInclusive
      ? Math.round((cart.total * rate) / (1 + rate))
      : Math.round(cart.total * rate);
  });

  const grandTotal = $derived.by(() =>
    data.taxInclusive ? cart.total : cart.total + taxAmount,
  );

  /* ── Helpers ───────────────────────────────────────────────────────────── */
  const PAY_META: Record<PaymentMethod, { icon: any; label: string; tone: 'primary' | 'teal' | 'cobalt' }> = {
    cash:     { icon: Banknote,        label: 'Cash',     tone: 'teal'    },
    credit:   { icon: CreditCard,      label: 'Card',     tone: 'cobalt'  },
    transfer: { icon: ArrowLeftRight,  label: 'Transfer', tone: 'primary' },
  };

  function setQty(productId: string, qty: number) {
    cart.setQty(productId, qty);
  }
  function bumpQty(p: any, delta: number) {
    const cur = cartByProduct.get(p.id) ?? 0;
    setQty(p.id, cur + delta);
  }

  function applyDiscount() {
    const v = parseFloat(discountStr);
    if (isNaN(v)) return;
    const type: DiscountType = discountStr.includes("%") ? "percent" : "amount";
    cart.setDiscount(type, type === "amount" ? Math.round(v * 100) : v);
  }

  async function submitSale() {
    if (cart.isEmpty) return;
    submitting = true;
    const payload = {
      items: cart.items,
      customer_id: cart.customerId,
      discount_type: cart.discountType,
      discount_value: cart.discountValue,
      discount_amount: cart.discountAmount,
      subtotal: cart.subtotal,
      total: grandTotal,
      tax_amount: taxAmount,
      payment_method: cart.paymentMethod,
      notes: cart.notes,
    };
    const url    = isEdit && saleId ? `/api/sales/${saleId}` : "/api/sales";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data2 = await res.json();
    if (res.ok) {
      lastSaleRef      = isEdit ? (data2.sale_ref ?? saleId ?? '') : (data2.sale_ref ?? '');
      lastSaleTotal    = grandTotal;
      lastSaleMethod   = cart.paymentMethod;
      lastSaleCustomer = cart.customerName || 'Walk-in';
      toasts.success(isEdit ? 'Sale updated' : 'Sale recorded');
      showCheckout = false;
      showReceipt  = true;
      cart.clear();
    } else {
      toasts.error(data2.error ?? "Sale failed");
    }
    submitting = false;
  }

  function clearCart() {
    if (cart.isEmpty) return;
    if (!confirm('Clear cart?')) return;
    cart.clear();
    discountStr = '';
  }
</script>

<svelte:head><title>{isEdit ? 'Edit Sale' : 'New Sale'} · Shëlf</title></svelte:head>

<div class="fade-up">
  <!-- Header row: title + customer + clear -->
  <div class="flex items-end justify-between gap-3 mb-4">
    <div class="min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
        {isEdit ? 'Edit sale' : 'New sale'}
      </h1>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      {#if cart.customerId}
        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--primary-dim)] text-[var(--primary-fg)] text-xs font-semibold">
          <User size={11} strokeWidth={2} />
          {cart.customerName}
          <button
            class="ml-1 opacity-60 hover:opacity-100"
            onclick={() => cart.setCustomer(null, '')}
            aria-label="Remove customer"
          ><X size={11} strokeWidth={2.5} /></button>
        </div>
      {/if}
      {#if !cart.isEmpty}
        <button class="btn btn-secondary btn-sm" onclick={clearCart}>
          <Trash2 size={12} strokeWidth={2} /> Clear
        </button>
      {/if}
    </div>
  </div>

  <!-- Search + category chips -->
  <div class="flex gap-2 mb-3">
    <div class="flex-1 min-w-0 relative">
      <SearchBar bind:value={search} placeholder="Search by name or SKU…" />
    </div>
  </div>

  <div class="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-5 px-5 md:mx-0 md:px-0">
    <button
      onclick={() => (filterCat = '')}
      class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all flex-shrink-0
        {filterCat === ''
          ? 'bg-[var(--primary)] text-white border-transparent shadow-sm'
          : 'bg-transparent text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)]'}"
    >
      <Package size={11} strokeWidth={2} />
      All
    </button>
    {#each data.categories as cat}
      {@const catId = (cat as any).id}
      {@const active = filterCat === catId}
      <button
        onclick={() => (filterCat = active ? '' : catId)}
        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all flex-shrink-0
          {active ? 'text-white border-transparent shadow-sm' : 'text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)]'}"
        style={active ? `background:${(cat as any).color ?? 'var(--primary)'}` : ''}
      >
        <DynamicIcon name={(cat as any).icon ?? 'Package'} size={11} strokeWidth={2} />
        {(cat as any).name}
      </button>
    {/each}
  </div>

  <!-- Sticky cart summary (mobile, when cart has items and is closed) -->
  {#if !cart.isEmpty && !cartOpen}
    <button
      onclick={() => (cartOpen = true)}
      class="md:hidden card-flat w-full mb-3 px-4 py-2.5 flex items-center justify-between gap-2 hover:border-[var(--primary)] transition-all"
    >
      <div class="flex items-center gap-2">
        <ShoppingCart size={14} strokeWidth={2} class="text-[var(--primary)]" />
        <span class="text-xs font-semibold">{cart.count} in cart</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(grandTotal)}</span>
        <ChevronRight size={14} strokeWidth={2} class="text-[var(--text-3)]" />
      </div>
    </button>
  {/if}

  <!-- Product grid -->
  {#if products.length === 0}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-12 h-12 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-3">
        <Search size={22} strokeWidth={1.75} class="text-[var(--text-3)]" />
      </div>
      <p class="text-sm font-semibold">No products found</p>
    </div>
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 anim-stagger">
      {#each products as p (p.id)}
        {@const catColor = p.category?.color ?? 'var(--primary)'}
        {@const inCart   = cartByProduct.get(p.id) ?? 0}
        {@const stockPct = Math.min(100, Math.round((p.qty / Math.max(p.qty + 5, 10)) * 100))}
        <div class="surface-card interactive p-3.5 flex flex-col gap-2 group {p.qty === 0 ? 'opacity-50' : ''}">
          <!-- Top: icon + (in-cart chip) -->
          <div class="flex items-start justify-between">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                 style="background:color-mix(in srgb, {catColor} 15%, transparent)">
              <DynamicIcon name={p.category?.icon ?? 'Package'} size={17}
                           style="color:{catColor}" />
            </div>
            {#if inCart > 0}
              <span class="badge badge-primary text-[10px]">{inCart} in cart</span>
            {/if}
          </div>

          <!-- Name + SKU -->
          <div class="min-w-0">
            <p class="text-[13px] font-semibold leading-tight line-clamp-2" title={p.name}>{p.name}</p>
            <p class="font-mono text-[10px] text-[var(--text-3)] mt-0.5">{p.sku}</p>
          </div>

          <!-- Price -->
          <p class="text-base font-bold tabular-nums">{formatCurrency(p.price)}</p>

          <!-- Stock bar -->
          <div class="flex items-center gap-2 mt-auto">
            <div class="flex-1 h-1 rounded-full bg-[var(--surface2)] overflow-hidden">
              <div class="h-full rounded-full"
                   style="width:{stockPct}%; background:{p.qty === 0 ? 'var(--crimson)' : p.qty <= 5 ? 'var(--gold)' : 'var(--teal)'}"></div>
            </div>
            <span class="text-[10px] text-[var(--text-3)] tabular-nums">{p.qty}</span>
          </div>

          <!-- Add / stepper -->
          {#if p.qty === 0}
            <div class="text-center text-[10px] text-[var(--crimson)] font-semibold py-1">Out of stock</div>
          {:else if inCart === 0}
            <button
              onclick={() => { cart.add(p); }}
              class="btn btn-primary btn-sm w-full justify-center gap-1"
            >
              <Plus size={13} strokeWidth={2.5} /> Add
            </button>
          {:else}
            <div class="flex items-center justify-between bg-[var(--primary)] text-white rounded-lg overflow-hidden">
              <button
                onclick={() => bumpQty(p, -1)}
                class="px-3 py-1.5 hover:bg-white/10 active:scale-95 transition"
                aria-label="Decrease quantity"
              ><Minus size={13} strokeWidth={2.5} /></button>
              <span class="text-sm font-bold tabular-nums">{inCart}</span>
              <button
                onclick={() => bumpQty(p, +1)}
                class="px-3 py-1.5 hover:bg-white/10 active:scale-95 transition disabled:opacity-50"
                disabled={inCart >= p.qty}
                aria-label="Increase quantity"
              ><Plus size={13} strokeWidth={2.5} /></button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Spacer for cart-sheet / FAB on mobile -->
  {#if !cart.isEmpty}
    <div class="md:hidden" style="height: calc(6rem + env(safe-area-inset-bottom))"></div>
  {/if}
</div>

<!-- ─────────────────────────────────────────────────────────────────────────
  CART DRAWER (desktop: right-side panel, mobile: bottom-sheet)
  ───────────────────────────────────────────────────────────────────────── -->
{#if cartOpen && cart.count > 0}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/30 animate-[fadeIn_200ms]"
    style="z-index: 45;"
    onclick={() => (cartOpen = false)}
    aria-label="Close cart"
  ></button>

  <!-- Drawer / sheet -->
  <aside
    class="fixed md:top-0 md:right-0 md:bottom-0 md:w-[380px] md:rounded-none
           bottom-0 left-0 right-0 max-h-[80vh] rounded-t-[20px]
           bg-[var(--surface)] border border-[var(--border)]
           flex flex-col shadow-[var(--shadow-lg)]"
    style="z-index: 46; padding-bottom: env(safe-area-inset-bottom);"
  >
    <!-- Drag handle (mobile only) -->
    <button
      class="md:hidden w-10 h-1 rounded-full bg-[var(--border)] mx-auto mt-3 flex-shrink-0"
      onclick={() => (cartOpen = false)}
      aria-label="Close cart"
    ></button>

    <!-- Header -->
    <div class="flex items-center justify-between px-5 pt-3 pb-2.5 border-b border-[var(--border)] flex-shrink-0">
      <div class="flex items-center gap-2">
        <ShoppingCart size={15} strokeWidth={2} class="text-[var(--primary)]" />
        <p class="text-sm font-semibold">Cart · {cart.count} item{cart.count === 1 ? '' : 's'}</p>
      </div>
      <div class="flex items-center gap-1">
        {#if !cart.isEmpty}
          <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={clearCart} aria-label="Clear cart">
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        {/if}
        <button class="btn btn-ghost btn-icon btn-sm" onclick={() => (cartOpen = false)} aria-label="Close">
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </div>

    <!-- Items -->
    <div class="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2 min-h-0">
      {#each cart.items as item (item.productId)}
        <div class="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--surface2)]">
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-semibold truncate">{item.name}</p>
            <p class="text-[10px] text-[var(--text-3)] tabular-nums">{formatCurrency(item.unitPrice)} each</p>
          </div>
          <div class="flex items-center gap-1 bg-[var(--bg)] rounded-lg p-0.5">
            <button class="btn btn-ghost btn-icon btn-sm"
                    onclick={() => cart.setQty(item.productId, item.qty - 1)}
                    aria-label="Decrease"><Minus size={12} strokeWidth={2.5} /></button>
            <span class="text-xs font-bold w-6 text-center tabular-nums">{item.qty}</span>
            <button class="btn btn-ghost btn-icon btn-sm disabled:opacity-40"
                    onclick={() => cart.setQty(item.productId, item.qty + 1)}
                    disabled={item.qty >= item.maxQty}
                    aria-label="Increase"><Plus size={12} strokeWidth={2.5} /></button>
          </div>
          <p class="text-[13px] font-bold tabular-nums w-16 text-right">{formatCurrency(item.unitPrice * item.qty)}</p>
        </div>
      {/each}
    </div>

    <!-- Footer -->
    <div class="px-5 pt-3 pb-4 border-t border-[var(--border)] bg-[var(--surface)] flex-shrink-0 space-y-3">
      <div class="flex flex-col gap-1 text-xs">
        <div class="flex justify-between">
          <span class="text-[var(--text-3)]">Subtotal</span>
          <span class="tabular-nums font-semibold">{formatCurrency(cart.subtotal)}</span>
        </div>
        {#if cart.discountAmount > 0}
          <div class="flex justify-between" style="color:var(--teal-fg)">
            <span class="font-semibold">Discount</span>
            <span class="tabular-nums font-semibold">– {formatCurrency(cart.discountAmount)}</span>
          </div>
        {/if}
        {#if data.taxRate > 0 && taxAmount > 0}
          <div class="flex justify-between text-[var(--text-3)]">
            <span>{data.taxName}</span>
            <span class="tabular-nums">{formatCurrency(taxAmount)}</span>
          </div>
        {/if}
        <div class="flex justify-between font-bold text-base pt-1 border-t border-[var(--border)] mt-1">
          <span>Total</span>
          <span class="tabular-nums">{formatCurrency(grandTotal)}</span>
        </div>
      </div>
      <Button
        onclick={() => { cartOpen = false; showCheckout = true; }}
        class="w-full justify-center"
        size="lg"
      >
        Checkout
        <ChevronRight size={14} strokeWidth={2.5} />
      </Button>
    </div>
  </aside>
{/if}

<!-- Floating cart pill (desktop, when cart closed & has items) -->
{#if !cartOpen && cart.count > 0}
  <div class="hidden md:block fixed right-6" style="bottom: 1.5rem; z-index: 46;">
    <button
      onclick={() => (cartOpen = true)}
      class="btn btn-primary btn-lg rounded-full shadow-[var(--shadow-lg)] gap-2 px-5 relative active:scale-95"
    >
      <ShoppingCart size={16} strokeWidth={2} />
      <span class="text-xs text-white/70 tabular-nums">{cart.count}</span>
      <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(grandTotal)}</span>
    </button>
  </div>
{/if}

<!-- Floating cart pill (mobile, bottom-right, above bottom nav) -->
{#if !cartOpen && cart.count > 0}
  <div class="md:hidden fixed right-4" style="bottom: calc(4.5rem + env(safe-area-inset-bottom)); z-index: 46;">
    <button
      onclick={() => (cartOpen = true)}
      class="btn btn-primary btn-lg rounded-full shadow-[var(--shadow-lg)] gap-2 px-5 relative active:scale-95"
    >
      <ShoppingCart size={16} strokeWidth={2} />
      <span class="text-xs text-white/70 tabular-nums">{cart.count}</span>
      <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(grandTotal)}</span>
    </button>
  </div>
{/if}

<!-- ─────────────────────────────────────────────────────────────────────────
  CHECKOUT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Modal bind:open={showCheckout} title="Complete sale" maxWidth="max-w-md">
  <div class="flex flex-col gap-4">
    <!-- Customer -->
    <div>
      <p class="input-label mb-1.5">Customer</p>
      {#if cart.customerId}
        <div class="flex items-center gap-2 p-2.5 bg-[var(--primary-dim)] rounded-lg">
          <User size={14} strokeWidth={2} class="text-[var(--primary)]" />
          <span class="text-sm font-semibold flex-1 text-[var(--primary-fg)]">{cart.customerName}</span>
          <button class="btn btn-ghost btn-icon btn-sm" onclick={() => cart.setCustomer(null, '')} aria-label="Remove customer">
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      {:else}
        <div class="relative">
          <SearchBar
            bind:value={customerSearch}
            placeholder="Search customer by name or phone…"
            oninput={() => (showCustPicker = true)}
          />
          {#if showCustPicker && filteredCustomers.length > 0}
            <div class="absolute top-full left-0 right-0 mt-1 card z-10 max-h-48 overflow-y-auto shadow-[var(--shadow)]">
              {#each filteredCustomers as c}
                <button
                  class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface2)] border-b last:border-0 border-[var(--border)] flex items-center justify-between gap-2"
                  onclick={() => {
                    cart.setCustomer(c.id, c.name);
                    customerSearch = '';
                    showCustPicker = false;
                  }}
                >
                  <span class="truncate">{c.name}</span>
                  {#if c.phone}<span class="text-[10px] text-[var(--text-3)]">{c.phone}</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Discount -->
    <div>
      <p class="input-label mb-1.5">Discount <span class="text-[var(--text-3)] font-normal">(optional)</span></p>
      <div class="flex gap-2">
        <input
          bind:value={discountStr}
          placeholder="Amount (e.g. 500) or percent (10%)"
          class="input text-sm flex-1"
          oninput={applyDiscount}
        />
        {#if cart.discountAmount > 0}
          <button
            class="btn btn-secondary btn-sm"
            onclick={() => { discountStr = ''; cart.setDiscount('amount', 0); }}
          >Clear</button>
        {/if}
      </div>
      {#if cart.discountAmount > 0}
        <p class="text-[11px] mt-1.5" style="color:var(--teal-fg)">
          Saving {formatCurrency(cart.discountAmount)} ({((cart.discountAmount / Math.max(cart.subtotal, 1)) * 100).toFixed(0)}% off)
        </p>
      {/if}
    </div>

    <!-- Payment -->
    <div>
      <p class="input-label mb-1.5">Payment method</p>
      <div class="grid grid-cols-3 gap-2">
        {#each ['cash', 'credit', 'transfer'] as m}
          {@const key      = m as PaymentMethod}
          {@const meta     = PAY_META[key]}
          {@const active   = cart.paymentMethod === key}
          <button
            class="py-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]
              {active
                ? 'shadow-sm'
                : 'border-[var(--border)] bg-[var(--surface2)] hover:bg-[var(--surface)] text-[var(--text-2)]'}"
            style={active ? `border-color:${meta.tone === 'primary' ? 'var(--primary)' : meta.tone === 'teal' ? 'var(--teal)' : 'var(--cobalt)'};
                              background:color-mix(in srgb, ${meta.tone === 'primary' ? 'var(--primary)' : meta.tone === 'teal' ? 'var(--teal)' : 'var(--cobalt)'} 12%, transparent);
                              color:${meta.tone === 'primary' ? 'var(--primary-fg)' : meta.tone === 'teal' ? 'var(--teal-fg)' : 'var(--cobalt-fg)'}` : ''}
            onclick={() => cart.setPaymentMethod(key)}
          >
            <meta.icon size={18} strokeWidth={2} />
            <span class="text-xs font-bold">{meta.label}</span>
            {#if active}<Check size={11} strokeWidth={3} class="opacity-60" />{/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Summary -->
    <div class="rounded-xl p-3.5 space-y-1.5 text-xs" style="background:var(--surface2)">
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Subtotal</span>
        <span class="tabular-nums font-semibold">{formatCurrency(cart.subtotal)}</span>
      </div>
      {#if cart.discountAmount > 0}
        <div class="flex justify-between" style="color:var(--teal-fg)">
          <span class="font-semibold">Discount</span>
          <span class="tabular-nums font-semibold">– {formatCurrency(cart.discountAmount)}</span>
        </div>
      {/if}
      {#if data.taxRate > 0 && taxAmount > 0}
        <div class="flex justify-between text-[var(--text-3)]">
          <span>{data.taxName}</span>
          <span class="tabular-nums">{formatCurrency(taxAmount)}</span>
        </div>
      {/if}
      <div class="flex justify-between font-bold text-base pt-1.5 border-t border-[var(--border)] mt-1">
        <span>Total</span>
        <span class="tabular-nums" style="color:var(--primary)">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button
        variant="secondary"
        onclick={() => (showCheckout = false)}
        class="flex-1 justify-center"
      >
        Back
      </Button>
      <Button
        loading={submitting}
        onclick={submitSale}
        class="flex-1 justify-center"
        size="lg"
      >
        {isEdit ? 'Update Sale' : 'Complete Sale'}
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- ─────────────────────────────────────────────────────────────────────────
  RECEIPT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Modal bind:open={showReceipt} title={isEdit ? 'Sale updated' : 'Sale complete'} maxWidth="max-w-sm">
  <div class="text-center py-3">
    <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
         style="background:var(--teal-dim)">
      <Check size={28} strokeWidth={3} style="color:var(--teal)" />
    </div>
    <p class="text-base font-bold mb-0.5">{isEdit ? 'Sale updated' : 'Sale recorded'}</p>
    <p class="text-xs text-[var(--text-3)]">
      Ref: <span class="font-mono font-semibold">{lastSaleRef}</span>
    </p>

    <!-- Quick recap -->
    <div class="mt-5 rounded-xl p-3 text-xs space-y-1.5 text-left" style="background:var(--surface2)">
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Customer</span>
        <span class="font-semibold truncate ml-2">{lastSaleCustomer}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Payment</span>
        <span class="font-semibold">{PAY_META[lastSaleMethod]?.label ?? lastSaleMethod}</span>
      </div>
      <div class="flex justify-between text-base font-bold pt-1.5 border-t border-[var(--border)] mt-1">
        <span>Total</span>
        <span class="tabular-nums" style="color:var(--primary)">{formatCurrency(lastSaleTotal)}</span>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button
        variant="secondary"
        onclick={() => (showReceipt = false)}
        class="flex-1 justify-center"
      >
        Done
      </Button>
      <Button
        onclick={() => { showReceipt = false; goto('/history'); }}
        class="flex-1 justify-center"
      >
        View history
      </Button>
    </div>
  {/snippet}
</Modal>