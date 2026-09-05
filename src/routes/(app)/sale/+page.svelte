<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { browser } from "$app/environment";
  import {
    cart,
    type PaymentMethod,
    type DiscountType,
  } from "$lib/stores/cart.svelte";
  import { toasts } from "$lib/stores/toast.svelte";
  import { formatCurrency, formatCurrencyCompact } from "$lib/utils/format";
  import { fuzzyFilter } from "$lib/utils/fuzzy";
  import { inview }  from "$lib/utils/inview";
  import { fly } from "svelte/transition";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import QtyInput from "$lib/components/ui/QtyInput.svelte";
  import ProductCardSkeleton from "$lib/components/ui/ProductCardSkeleton.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import { navigating } from '$app/state';
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { getDb } from '$lib/offline/offlineDb';
  import { currentShop } from '$lib/stores/shop.svelte';
  import {
    ShoppingCart, Trash2, User, Plus, Minus,
    Banknote, CreditCard, ArrowLeftRight, X,
    Search, Check, ChevronRight, ChevronDown, Package, ScanLine,
    Clock, AlertCircle, Calendar,
  } from "lucide-svelte";

  let { data } = $props();

  /* ── UI state ──────────────────────────────────────────────────────────── */
  let search        = $state("");
  let filterCat     = $state("");
  let cartOpen      = $state(false);
  let showCheckout  = $state(false);
  let submitting        = $state(false);
  let creditPromptOpen  = $state(false);   // modal that asks for amount received
  let showReceipt   = $state(false);
  let scanOpen      = $state(false);
  let lastSaleRef   = $state("");
  let lastSaleTotal = $state(0);
  let lastSaleMethod = $state<PaymentMethod>('cash');
  let lastSaleCustomer = $state<string>('');
  let discountStr   = $state("");
  let customerSearch = $state("");

  // Tracks which product ids are currently in (or near) the viewport — only
  // those render real card DOM; everything else renders a cheap skeleton.
  // Cart state lives in the cart store and is independent of card DOM, so
  // adding to cart / qty steppers all keep working through the full filter
  // and sort pipeline.
  //   - SSR (browser === false): all items render real cards.
  //   - Client mount: observer marks visible items; off-screen items get
  //     swapped to skeletons via the visibility set.
  //   - When the products list changes, the $effect re-seeds to the new
  //     full set so newly-included items become visible immediately.
  let saleVisibleIds = $state<Set<string>>(new Set());
  let saleMounted = $state(false);

  function setSaleVisible(id: string, v: boolean) {
    if (v) saleVisibleIds.add(id);
    else   saleVisibleIds.delete(id);
  }

  $effect(() => {
    saleVisibleIds = new Set(products.map((p: any) => p.id));
    if (!saleMounted) saleMounted = true;
  });
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
        : `${Number(sale.discount_value).toFixed(2)}`;
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
    if (search.trim()) {
      list = fuzzyFilter(list, search, {
        fields: [
          { get: (p: any) => p.name, weight: 2 },
          { get: (p: any) => p.sku,  weight: 1.5 },
        ],
      });
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
    return fuzzyFilter(list, customerSearch, {
      fields: [
        { get: (c: any) => c.name,  weight: 2 },
        { get: (c: any) => c.phone, weight: 1.5 },
      ],
    }).slice(0, 8);
  });

  /* ── Derived: tax + total ──────────────────────────────────────────────── */
  const taxAmount = $derived.by(() => {
    const rate = (data.taxRate ?? 0) / 10000;
    if (!rate) return 0;
    return data.taxInclusive
      ? Math.round((cart.total * rate) / (1 + rate))
      : Math.round(cart.total * rate);
  });

  /* ── Derived: datetime-local input value (empty = "now") ─────────────────
     <input type="datetime-local"> expects "YYYY-MM-DDTHH:MM" in LOCAL time.
     We convert the cart's ISO string (UTC) to that format. When the cart
     has no override, we leave the field empty — the input then shows the
     placeholder (mm/dd/yyyy --:--) and the server uses now() on submit. */
  const tsLocalValue = $derived.by(() => {
    if (!cart.createdAt) return '';
    const d = new Date(cart.createdAt);
    if (isNaN(d.getTime())) return '';
    // Format YYYY-MM-DDTHH:MM in the user's local timezone
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const grandTotal = $derived.by(() =>
    data.taxInclusive ? cart.total : cart.total + taxAmount,
  );

  /* ── Helpers ───────────────────────────────────────────────────────────── */
  const PAY_META: Record<PaymentMethod, { icon: any; label: string; tone: 'primary' | 'teal' | 'cobalt' | 'gold' }> = {
    cash:     { icon: Banknote,        label: 'Cash',     tone: 'teal'    },
    // 'credit' = customer owes money (full or partial). When the user
    // picks this, a dedicated modal pops up to capture the amount
    // received and due date. They can't complete the sale without
    // confirming the modal.
    credit:   { icon: Clock,           label: 'On credit', tone: 'gold'    },
    transfer: { icon: ArrowLeftRight,  label: 'UPI',      tone: 'primary' },
  };

  // Picking 'credit' from the checkout sheet opens a dedicated modal
  // that asks for the amount received and (optionally) a due date.
  // The user MUST confirm the modal to keep the credit selection —
  // cancelling the modal flips payment back to 'cash' (the default).
  function pickPaymentMethod(key: PaymentMethod) {
    cart.setPaymentMethod(key);
    if (key === 'credit') {
      creditPromptOpen = true;
    }
  }
  // Confirm the credit prompt. The caller (cart or checkout sheet)
  // is inferred from whether the cart sheet is still open at confirm
  // time. If the cart is open, the user came from there and we
  // submit the sale directly (skipping the checkout sheet — for
  // credit, the checkout sheet was just a customer picker which the
  // credit prompt has already replaced). If the cart is closed, the
  // user came from the checkout sheet (via "Change amount") and we
  // just close the modal so they can hit Complete Sale.
  function confirmCreditPrompt() {
    if (!cart.customerId) {
      toasts.error('Pick a customer for credit sales first');
      creditPromptOpen = false;
      cart.setPaymentMethod('cash');
      return;
    }
    creditPromptOpen = false;
    if (!cartOpen) {
      // Came from the checkout sheet's "Change amount" — just close.
      return;
    }
    // Came from the cart — submit the sale directly.
    void submitSale();
  }
  // Cancel the credit prompt — flip back to cash and reset the credit
  // form. The user explicitly chose not to do credit.
  function cancelCreditPrompt() {
    creditPromptOpen = false;
    cart.setPaymentMethod('cash');
    creditAmountPaid = '';
    creditDueDate = '';
  }
  // Open the credit prompt from inside the checkout sheet. The checkout
  // sheet is closed first because Svelte/SvelteKit's nested-modal UX is
  // fiddly — opening a fresh sheet from the cart screen gives a cleaner
  // result (and the checkout state is preserved on the cart).
  function openCreditPrompt() {
    if (!cart.customerId) {
      toasts.error('Pick a customer before changing the credit amount');
      return;
    }
    showCheckout = false;
    // Brief delay so the checkout sheet animates out before the
    // credit prompt animates in (avoids two sheets fighting for focus).
    setTimeout(() => { creditPromptOpen = true; }, 150);
  }
  // Same as openCreditPrompt but for the cart sheet. Closes the cart
  // sheet, then opens the credit prompt after the close animation.
  function openCreditPromptFromCart() {
    if (!cart.customerId) {
      toasts.error('Pick a customer for credit sales first');
      return;
    }
    cartOpen = false;
    setTimeout(() => { creditPromptOpen = true; }, 150);
  }
  // The cart's checkout button. For credit, it says "Next" and opens
  // the credit prompt. For everything else, it goes to the checkout
  // sheet (where the user picks the customer and confirms).
  function handleCheckoutClick() {
    if (cart.paymentMethod === 'credit') {
      if (!cart.customerId) {
        toasts.error('Pick a customer for credit sales first');
        return;
      }
      openCreditPromptFromCart();
    } else {
      cartOpen = false;
      showCheckout = true;
    }
  }

  /* ── Credit sub-form state ────────────────────────────────────────────
     When the user picks 'On credit' payment, a sub-form asks:
       - Amount received now: 0 for full pending, the total for full paid,
         anything in between for partial
       - Due date: optional, for tracking when the customer promises to pay
     Status is derived from the amount received. */
  let creditAmountPaid = $state<string>('');
  let creditDueDate    = $state<string>('');
  // Derive credit_status from the amount received. This replaces the
  // old 3-button "Status" picker — the user just types the amount and
  // we figure out the status. 0 = pending, full = paid, anything in
  // between = partial.
  const creditStatus = $derived.by(() => {
    if (cart.paymentMethod !== 'credit') return 'pending';
    const amt = parseFloat(creditAmountPaid);
    if (isNaN(amt) || amt <= 0)             return 'pending';
    if (amt >= grandTotal - 0.005)         return 'paid';
    return 'partial';
  });
  const creditNumeric = $derived(parseFloat(creditAmountPaid) || 0);
  // Reset credit sub-form when the user switches away from credit
  $effect(() => {
    if (cart.paymentMethod !== 'credit') {
      creditAmountPaid = '';
      creditDueDate = '';
    }
  });

  function setQty(productId: string, qty: number) {
    cart.setQty(productId, qty);
  }

  function applyDiscount() {
    const v = parseFloat(discountStr);
    if (isNaN(v)) return;
    const type: DiscountType = discountStr.includes("%") ? "percent" : "amount";
    cart.setDiscount(type, v);
  }

  async function submitSale() {
    if (cart.isEmpty) return;
    // Credit sales MUST have a customer — we can't track who owes the
    // money otherwise. Block the submission here (the button is also
    // disabled below for a clearer signal).
    if (cart.paymentMethod === 'credit' && !cart.customerId) {
      toasts.error('Pick a customer for credit sales');
      return;
    }
    // For partial credit, validate the amount is sane.
    if (cart.paymentMethod === 'credit' && creditStatus === 'partial') {
      if (creditNumeric <= 0 || creditNumeric >= grandTotal) {
        toasts.error('Partial credit amount must be > 0 and < total');
        return;
      }
    }
    submitting = true;
    const payload: any = {
      items: cart.items,
      customer_id: cart.customerId,
      customer_name: cart.customerName,
      discount_type: cart.discountType,
      discount_value: cart.discountValue,
      discount_amount: cart.discountAmount,
      subtotal: cart.subtotal,
      total: grandTotal,
      tax_amount: taxAmount,
      payment_method: cart.paymentMethod,
      notes: cart.notes,
      // Optional backdate / clock-skew correction. Null = use now().
      created_at: cart.createdAt,
    };
    // Credit fields — only included when the user picked credit.
    // creditStatus is derived from creditAmountPaid, so we don't need
    // a separate picker; we just send the amount we received.
    if (cart.paymentMethod === 'credit') {
      payload.credit_status = creditStatus;
      payload.credit_amount_paid = creditNumeric;
      if (creditDueDate) {
        payload.credit_due_date = creditDueDate;
      }
    }

    // Offline path: queue the sale in IndexedDB and let the SW
    // (or the next page boot) flush it.  We don't have a server
    // reference number yet, so we skip the receipt modal.
    //
    // The stored payload matches the snake_case shape the
    // /api/sales endpoint maps to (see `p_items` mapping in that
    // handler) — so when the SW or page replays it, it just gets
    // forwarded as-is.
    if (!offlineSync.online) {
      const id = crypto.randomUUID();
      try {
        const db = await getDb();
        const queuePayload = {
          items: payload.items.map((i: any) => ({
            product_id: i.productId,
            name: i.name,
            sku: i.sku,
            qty: i.qty,
            unit_price: i.unitPrice,
          })),
          customer_id: payload.customer_id,
          customer_name: payload.customer_name,
          discount_type: payload.discount_type,
          discount_value: payload.discount_value,
          payment_method: payload.payment_method,
          notes: payload.notes,
          subtotal: payload.subtotal,
          discount_amount: payload.discount_amount,
          total: payload.total,
          tax_amount: payload.tax_amount,
          // Carry the backdate override through the offline queue so
          // the SW replay preserves the user's chosen timestamp.
          created_at: payload.created_at,
          // Credit fields — also carry through so the SW replay
          // preserves the credit status / amount paid / due date.
          credit_status:       payload.credit_status,
          credit_amount_paid:  payload.credit_amount_paid,
          credit_due_date:     payload.credit_due_date,
        };
        await db.put('pending_sales', {
          id,
          shop_id: currentShop.data?.id ?? '',
          created_at: Date.now(),
          payload: queuePayload,
          status: 'pending',
          last_error: null,
          attempts: 0,
        });
        toasts.success("Sale saved offline — it'll sync when you're back online");
        await offlineSync.refreshPendingCount();
        showCheckout = false;
        cart.clear();
      } catch (e: any) {
        toasts.error(e?.message ?? 'Could not save offline');
      }
      submitting = false;
      return;
    }

    const url    = isEdit && saleId ? `/api/sales/${saleId}` : '/api/sales';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
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
      toasts.error(data2.error ?? 'Sale failed');
    }
    submitting = false;
  }

  function clearCart() {
    if (cart.isEmpty) return;
    if (!confirm('Clear cart?')) return;
    cart.clear();
    discountStr = '';
  }

  /**
   * Scanner hit handler.  Called by BarcodeScanner with the decoded
   * barcode string.  Looks up the product and adds it to the cart.
   *
   * The scanner already debounces duplicate reads and closes itself
   * before calling this, so we don't have to worry about a steady
   * hold firing 30 times — one scan = one cart add.
   */
  async function onScanResult(code: string) {
    scanOpen = false;
    try {
      const res = await fetch(`/api/products/by-barcode/${encodeURIComponent(code)}`);
      if (res.ok) {
        const p = await res.json();
        cart.add(p);
        toasts.success(`Added ${p.name}`);
      } else if (res.status === 404) {
        // The user can still add the product to inventory from the
        // toast's undo affordance (added in a follow-up if useful) or
        // by navigating to /inventory manually.
        toasts.error(`No product found for ${code}`);
      } else {
        toasts.error('Lookup failed');
      }
    } catch {
      toasts.error('Network error');
    }
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
        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--primary)] text-[var(--primary-fg)] text-xs font-semibold">
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

  <!-- Search + scan button + category chips -->
  <div class="flex gap-2 mb-3">
    <div class="flex-1 min-w-0 relative">
      <SearchBar bind:value={search} placeholder="Search by name or SKU…" />
    </div>
    <!--
      Mobile-only: the back camera.  Desktop users have no use for
      this (they have a webcam at most, not a barcode scanner) so
      it's hidden on md+ where the search bar is wide enough on its
      own.
    -->
    <button
      type="button"
      class="md:hidden shrink-0 w-10 h-10 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center active:scale-95 transition-transform"
      onclick={() => (scanOpen = true)}
      aria-label="Scan barcode"
      title="Scan barcode"
    >
      <ScanLine size={16} strokeWidth={2} />
    </button>
  </div>

  <div class="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-5 px-5 md:mx-0 md:px-0">
    <button
      onclick={() => (filterCat = '')}
      class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all flex-shrink-0
        {filterCat === ''
          ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent shadow-sm'
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
          {active ? 'text-[var(--primary-fg)] border-transparent shadow-sm' : 'text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)]'}"
        style={active ? `background:${(cat as any).color ?? 'var(--primary)'}; color:${(cat as any).color ? '#fff' : 'var(--primary-fg)'}` : ''}
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
  {#if navigating.to}
    <!--
      Skeleton state during client-side navigation. Shows 8 ghost
      cards matching the real grid shape so the layout doesn't
      shift when the data arrives. The `anim-stagger` makes them
      appear to fill in left-to-right.
    -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 anim-stagger">
      {#each Array(8) as _, i (i)}
        <ProductCardSkeleton />
      {/each}
    </div>
  {:else if products.length === 0}
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
            <div
              class="inv-grid-item"
              use:inview={(v) => setSaleVisible(p.id, v)}
            >
              {#if !browser || !saleMounted || saleVisibleIds.has(p.id)}
                <div
                  class="surface-card interactive p-3.5 flex flex-col gap-2 group {p.qty === 0 ? 'opacity-50' : ''}"
                  in:fly={{ y: 6, duration: 200 }}
                  out:fly={{ y: -6, duration: 150 }}
                >
                  <!-- Top: icon + (in-cart chip) -->
                  <div class="flex items-start justify-between">
                    <div class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
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
                      class="group/btn relative w-full h-7 rounded-md text-[11px] font-semibold tabular-nums
                             bg-[var(--surface2)] text-[var(--text-2)] border border-[var(--border)]
                             hover:bg-[var(--primary-dim)] hover:text-[var(--text)] hover:border-[var(--primary)]
                             active:scale-[0.98] transition-colors transition-transform
                             inline-flex items-center justify-center gap-1"
                    >
                      <Plus size={12} strokeWidth={2.5} class="opacity-70 group-hover/btn:opacity-100" /> Add
                    </button>
                  {:else}
                    <div class="flex items-center justify-between bg-[var(--primary)] text-[var(--primary-fg)] rounded-lg overflow-hidden">
                      <QtyInput
                        value={inCart}
                        max={p.qty}
                        onChange={(qty) => setQty(p.id, qty)}
                        variant="primary"
                        size="sm"
                        showSteppers
                      />
                    </div>
                  {/if}
                </div>
              {:else}
                <!-- Skeleton: stable layout, no content rendered -->
                <ProductCardSkeleton />
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
  CART MODAL (Sheet — centered dialog on desktop, drag-handle bottom-sheet on mobile)
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet
  bind:open={cartOpen}
  title="Cart · {cart.count} item{cart.count === 1 ? '' : 's'}"
  maxWidth="max-w-md"
>
  <!-- Items -->
  <div class="flex flex-col gap-2 -mx-2">
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
          <QtyInput
            value={item.qty}
            max={item.maxQty}
            onChange={(q) => cart.setQty(item.productId, q)}
          />
          <button class="btn btn-ghost btn-icon btn-sm disabled:opacity-40"
                  onclick={() => cart.setQty(item.productId, item.qty + 1)}
                  disabled={item.qty >= item.maxQty}
                  aria-label="Increase"><Plus size={12} strokeWidth={2.5} /></button>
        </div>
        <p class="text-[13px] font-bold tabular-nums w-16 text-right">{formatCurrency(item.unitPrice * item.qty)}</p>
      </div>
    {/each}
  </div>

  {#snippet footer()}
    <div class="space-y-3">
      <!-- Customer picker — required for credit, optional for everything
           else. Shown above the payment method so the user picks
           "who's buying" before "how are they paying". -->
      <div>
        <p class="input-label mb-1.5">
          Customer
          {#if cart.paymentMethod === 'credit'}
            <span class="text-[var(--crimson-fg)] ml-1">*</span>
          {/if}
        </p>
        <div class="relative">
          <button
            type="button"
            class="input w-full text-left flex items-center justify-between"
            onclick={() => (showCustPicker = !showCustPicker)}
          >
            <span class={cart.customerName ? 'font-semibold' : 'text-[var(--text-3)]'}>
              {cart.customerName ?? 'Walk-in (no customer)'}
            </span>
            <ChevronDown size={12} strokeWidth={2} class="text-[var(--text-3)]" />
          </button>
          {#if showCustPicker}
            <div class="absolute top-full left-0 right-0 mt-1 card z-10 max-h-48 overflow-y-auto shadow-[var(--shadow)]">
              <button
                class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface2)] border-b border-[var(--border)] flex items-center justify-between"
                onclick={() => {
                  cart.setCustomer(null, '');
                  showCustPicker = false;
                }}
              >
                <span class="text-[var(--text-3)]">Walk-in (no customer)</span>
              </button>
              <input
                type="text"
                class="input w-full text-[12px] mb-1"
                placeholder="Search customers…"
                value={customerSearch}
                oninput={(e) => (customerSearch = (e.target as HTMLInputElement).value)}
              />
              {#if filteredCustomers.length > 0}
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
              {:else if customerSearch.trim().length > 0}
                <p class="text-[10.5px] text-[var(--text-3)] px-3 py-2 italic">No matches</p>
              {:else}
                <p class="text-[10.5px] text-[var(--text-3)] px-3 py-2 italic">Type to search…</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Payment method picker. For non-credit, tapping Checkout goes
           straight to the checkout sheet. For credit, the button label
           changes to "Next" and tapping it opens the credit prompt
           modal. Either way, picking credit commits the customer choice
           and the amount received happens before submitSale(). -->
      <div>
        <p class="input-label mb-1.5">Payment method</p>
        <div class="grid grid-cols-3 gap-1.5">
          {#each ['cash', 'credit', 'transfer'] as m}
            {@const key    = m as PaymentMethod}
            {@const meta   = PAY_META[key]}
            {@const active = cart.paymentMethod === key}
            <button
              type="button"
              class="py-2.5 rounded-lg border-2 flex flex-col items-center gap-0.5 transition-all active:scale-[0.97]
                {active
                  ? 'shadow-sm'
                  : 'border-[var(--border)] bg-[var(--surface2)] hover:bg-[var(--surface)] text-[var(--text-2)]'}"
              style={active
                ? `border-color:${meta.tone === 'primary' ? 'var(--primary)' : meta.tone === 'teal' ? 'var(--teal)' : meta.tone === 'gold' ? 'var(--gold)' : 'var(--cobalt)'};
                   background:color-mix(in srgb, ${meta.tone === 'primary' ? 'var(--primary)' : meta.tone === 'teal' ? 'var(--teal)' : meta.tone === 'gold' ? 'var(--gold)' : 'var(--cobalt)'} 10%, transparent);
                   color:${meta.tone === 'primary' ? 'var(--primary-fg)' : meta.tone === 'teal' ? 'var(--teal-fg)' : meta.tone === 'gold' ? 'var(--gold-fg)' : 'var(--cobalt-fg)'}`
                : ''}
              onclick={() => pickPaymentMethod(key)}
            >
              <meta.icon size={15} strokeWidth={2} />
              <span class="text-[10.5px] font-bold">{meta.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Compact credit summary if credit is selected. Tapping "Edit
           amount" re-opens the credit prompt modal. -->
      {#if cart.paymentMethod === 'credit'}
        <div class="rounded-lg p-2.5 flex items-center justify-between gap-2"
             style="background:color-mix(in srgb, var(--gold) 10%, var(--surface));">
          <div class="text-[10.5px]">
            <span style="color:var(--gold-fg); font-weight:600">
              {creditStatus === 'paid' ? 'Paid in full'
                : creditStatus === 'partial' ? 'Partial · due ' + formatCurrency(Math.max(0, grandTotal - creditNumeric))
                : 'Pending · ' + formatCurrency(grandTotal) + ' due'}
            </span>
            {#if cart.customerId}
              <span class="text-[var(--text-3)] ml-1">· {cart.customerName}</span>
            {:else}
              <span class="ml-1" style="color:var(--crimson-fg); font-weight:600">· pick a customer</span>
            {/if}
          </div>
          <button
            type="button"
            class="text-[10.5px] font-semibold underline-offset-2 hover:underline"
            style="color:var(--gold-fg)"
            onclick={openCreditPromptFromCart}
          >
            {creditStatus === 'pending' ? 'Set amount' : 'Edit'}
          </button>
        </div>
      {/if}

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
      <div class="flex gap-2">
        {#if !cart.isEmpty}
          <button
            onclick={clearCart}
            class="btn btn-secondary justify-center px-3"
            aria-label="Clear cart"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        {/if}
        <Button
          onclick={handleCheckoutClick}
          class="flex-1 justify-center"
          size="lg"
          disabled={cart.paymentMethod === 'credit' && !cart.customerId}
        >
          {cart.paymentMethod === 'credit' ? 'Next' : 'Checkout'}
          <ChevronRight size={14} strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  {/snippet}
</Sheet>

<!-- Floating cart pill (desktop, when cart closed & has items) -->
{#if !cartOpen && cart.count > 0}
  <div class="hidden md:block fixed right-6" style="bottom: 1.5rem; z-index: 46;">
    <button
      onclick={() => (cartOpen = true)}
      class="btn btn-primary btn-lg rounded-full shadow-[var(--shadow-lg)] gap-2 px-5 relative active:scale-95"
    >
      <ShoppingCart size={16} strokeWidth={2} />
      <span class="text-xs text-[var(--primary-fg)]/70 tabular-nums">{cart.count}</span>
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
      <span class="text-xs text-[var(--primary-fg)]/70 tabular-nums">{cart.count}</span>
      <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(grandTotal)}</span>
    </button>
  </div>
{/if}

<!-- ─────────────────────────────────────────────────────────────────────────
  CHECKOUT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showCheckout} title="Complete sale" maxWidth="max-w-md">
  <div class="flex flex-col gap-4">
    <!-- Sale timestamp — defaults to now; user can backdate or correct clock skew.
         Above the customer selector per the design decision. -->
    <div>
      <p class="input-label mb-1.5">
        Date &amp; time
        <span class="text-[var(--text-3)] font-normal">
          (defaults to now)
        </span>
      </p>
      <input
        type="datetime-local"
        class="input"
        value={tsLocalValue}
        oninput={(e) => cart.setCreatedAt((e.currentTarget as HTMLInputElement).value || null)}
      />
      {#if cart.createdAt}
        <button
          type="button"
          class="text-[10px] text-[var(--text-3)] underline mt-1"
          onclick={() => cart.setCreatedAt(null)}
          aria-label="Reset timestamp to now"
        >
          Reset to now
        </button>
      {/if}
    </div>

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

    <!-- Payment (read-only here; user picked it in the cart sheet).
         The icon + label is shown for clarity, plus a 'Change' link
         that pops them back to the cart to re-select. -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <p class="input-label">Payment method</p>
        <button
          type="button"
          class="text-[10.5px] font-semibold underline-offset-2 hover:underline"
          style="color:var(--primary-fg)"
          onclick={() => { showCheckout = false; cartOpen = true; }}
        >
          Change
        </button>
      </div>
      {#if true}
        {@const m = PAY_META[cart.paymentMethod]}
        <div class="input w-full flex items-center gap-2 py-2.5"
             style={m ? `border-color:${m.tone === 'primary' ? 'var(--primary)' : m.tone === 'teal' ? 'var(--teal)' : m.tone === 'gold' ? 'var(--gold)' : 'var(--cobalt)'};` : ''}>
          {#if m}
            <m.icon size={15} strokeWidth={2} />
            <span class="text-[12.5px] font-bold">{m.label}</span>
          {:else}
            <span class="text-[12.5px] font-semibold">{cart.paymentMethod}</span>
          {/if}
          {#if cart.paymentMethod === 'credit' && creditNumeric > 0 && creditNumeric < grandTotal}
            <span class="ml-auto text-[10.5px] font-semibold" style="color:var(--gold-fg)">
              received {formatCurrency(creditNumeric)}
            </span>
          {/if}
          {#if cart.paymentMethod === 'credit' && creditNumeric >= grandTotal}
            <span class="ml-auto text-[10.5px] font-semibold" style="color:var(--teal-fg)">
              paid in full
            </span>
          {/if}
        </div>
      {/if}
    </div>

    {#if cart.paymentMethod === 'credit'}
      <!-- Read-only summary of the on-credit state set in the modal.
           Edit by opening the credit prompt modal via "Change amount". -->
      <div class="rounded-xl p-3 space-y-2" style="background:var(--gold-dim); border:1px solid color-mix(in srgb, var(--gold) 30%, transparent);">
        <div class="flex items-center gap-2 text-[var(--gold-fg)]">
          <AlertCircle size={13} strokeWidth={2.2} />
          <p class="text-[11px] font-semibold">
            On credit — {cart.customerId ? `owing ${cart.customerName}` : 'pick a customer above'}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg p-2" style="background:color-mix(in srgb, var(--gold) 8%, var(--surface))">
            <p class="text-[9px] font-bold uppercase tracking-wider text-[var(--text-3)]">Received</p>
            <p class="text-[13px] font-bold tabular-nums text-[var(--text)] mt-0.5">{formatCurrency(creditNumeric)}</p>
          </div>
          <div class="rounded-lg p-2" style="background:color-mix(in srgb, var(--crimson) 10%, var(--surface))">
            <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--crimson-fg)">Amount due</p>
            <p class="text-[13px] font-bold tabular-nums mt-0.5" style="color:var(--crimson-fg)">{formatCurrency(Math.max(0, grandTotal - creditNumeric))}</p>
          </div>
        </div>
        <button
          type="button"
          class="text-[11px] font-semibold underline-offset-2 hover:underline"
          style="color:var(--gold-fg)"
          onclick={openCreditPrompt}
        >
          Change amount
        </button>
      </div>
    {/if}

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
        disabled={submitting || (cart.paymentMethod === 'credit' && !cart.customerId)}
        onclick={submitSale}
        class="flex-1 justify-center"
        size="lg"
      >
        {isEdit ? 'Update Sale' : 'Complete Sale'}
      </Button>
    </div>
  {/snippet}
</Sheet>

<!-- ─────────────────────────────────────────────────────────────────────────
  CREDIT PROMPT MODAL
  Pops up the moment the user picks 'On credit'. They MUST enter
  the amount received (defaults to 0 = full pending) and confirm
  before the sale can be completed. Cancelling the modal flips
  payment back to 'cash' so the user is never stuck on 'credit'.
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={creditPromptOpen} title="On credit — set amount received" maxWidth="max-w-md">
  <div class="space-y-4">
    <div class="flex items-start gap-2.5 p-3 rounded-xl"
         style="background:var(--gold-dim); border:1px solid color-mix(in srgb, var(--gold) 30%, transparent);">
      <AlertCircle size={14} strokeWidth={2.2} class="mt-0.5 shrink-0" style="color:var(--gold-fg)" />
      <p class="text-[11.5px] leading-relaxed" style="color:var(--gold-fg)">
        Customer is taking goods now and paying later. How much
        are they paying <strong>right now</strong>?
        Leave at 0 to record the full bill as pending.
      </p>
    </div>

    <!-- Customer + total summary -->
    <div class="rounded-xl p-3 space-y-2" style="background:var(--surface2)">
      <div class="flex justify-between text-[11.5px]">
        <span class="text-[var(--text-3)]">Customer</span>
        <span class="font-semibold truncate ml-2">{cart.customerName ?? '—'}</span>
      </div>
      <div class="flex justify-between text-[11.5px]">
        <span class="text-[var(--text-3)]">Total bill</span>
        <span class="font-bold tabular-nums">{formatCurrency(grandTotal)}</span>
      </div>
    </div>

    <!-- Amount received now -->
    <div>
      <p class="input-label mb-1.5">
        Amount received now
        <span class="text-[var(--text-3)] font-normal ml-1">(0 = full pending)</span>
      </p>
      <Input
        type="number"
        step="0.01"
        min="0"
        max={grandTotal}
        bind:value={creditAmountPaid}
        placeholder="0"
      />
    </div>

    <!-- Live summary: pending amount + status chip -->
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg p-2.5" style="background:color-mix(in srgb, var(--crimson) 10%, var(--surface))">
        <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--crimson-fg)">Amount due</p>
        <p class="text-[16px] font-bold tabular-nums mt-0.5" style="color:var(--crimson-fg)">{formatCurrency(Math.max(0, grandTotal - creditNumeric))}</p>
      </div>
      <div class="rounded-lg p-2.5 flex flex-col justify-center"
           style="background:color-mix(in srgb,
             {creditStatus === 'paid' ? 'var(--teal)' : creditStatus === 'partial' ? 'var(--gold)' : 'var(--crimson)'} 10%,
             var(--surface))">
        <p class="text-[9px] font-bold uppercase tracking-wider text-[var(--text-3)]">Status</p>
        <p class="text-[14px] font-bold mt-0.5"
           style="color: {creditStatus === 'paid' ? 'var(--teal-fg)' : creditStatus === 'partial' ? 'var(--gold-fg)' : 'var(--crimson-fg)'}">
          {creditStatus === 'paid' ? 'Paid in full' : creditStatus === 'partial' ? 'Partial' : 'Pending'}
        </p>
      </div>
    </div>

    <!-- Quick-fill buttons -->
    <div>
      <p class="input-label mb-1.5">Quick fill</p>
      <div class="grid grid-cols-4 gap-1.5">
        <button type="button" class="btn btn-secondary btn-sm text-[11px]"
                onclick={() => creditAmountPaid = '0'}>
          None (₹0)
        </button>
        <button type="button" class="btn btn-secondary btn-sm text-[11px]"
                onclick={() => creditAmountPaid = String(grandTotal / 2)}>
          Half
        </button>
        <button type="button" class="btn btn-secondary btn-sm text-[11px]"
                onclick={() => creditAmountPaid = String(grandTotal)}>
          All
        </button>
        <button type="button" class="btn btn-secondary btn-sm text-[11px]"
                onclick={() => creditAmountPaid = ''}>
          Clear
        </button>
      </div>
    </div>

    <!-- Due date -->
    <div>
      <p class="input-label mb-1.5">
        Due date
        <span class="text-[var(--text-3)] font-normal ml-1">(optional)</span>
      </p>
      <Input type="date" bind:value={creditDueDate} />
    </div>

    <!-- Customer reminder if not picked yet -->
    {#if !cart.customerId}
      <div class="rounded-lg p-2.5 text-[11px] font-semibold"
           style="background:color-mix(in srgb, var(--crimson) 10%, var(--surface)); color:var(--crimson-fg);">
        Pick a customer above the payment options before confirming.
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={cancelCreditPrompt} class="flex-1">
        Use cash instead
      </Button>
      <Button variant="primary" onclick={confirmCreditPrompt} disabled={!cart.customerId} class="flex-1">
        Confirm on credit
      </Button>
    </div>
  {/snippet}
</Sheet>

<!-- ─────────────────────────────────────────────────────────────────────────
  RECEIPT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showReceipt} title={isEdit ? 'Sale updated' : 'Sale complete'} maxWidth="max-w-sm">
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
        onclick={() => { showReceipt = false; }}
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
</Sheet>

<!-- ─────────────────────────────────────────────────────────────────────────
  BARCODE SCANNER
  Mounted once, controlled by scanOpen.  See BarcodeScanner.svelte for
  the camera + decoding logic.
  ───────────────────────────────────────────────────────────────────────── -->
<BarcodeScanner
  open={scanOpen}
  onClose={() => (scanOpen = false)}
  onResult={onScanResult}
/>