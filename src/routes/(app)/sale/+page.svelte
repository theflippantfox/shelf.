<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
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
  import { inventory as invStore } from "$lib/stores/inventory.svelte";
  import { customers as custStore } from "$lib/stores/customers.svelte";
  import { sales as salesStore } from "$lib/stores/sales.svelte";
import { register as regStore } from "$lib/stores/register.svelte";
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
  import { offlineFetch } from '$lib/offline/offlineFetch';
  import {
    ShoppingCart, Trash2, User, Plus, Minus,
    Banknote, ArrowLeftRight, X,
    Search, Check, ChevronRight, ChevronDown, Package, ScanLine,
    Clock, Pause, Play, Trash,
  } from "lucide-svelte";

  let { data } = $props();

  /* ── UI state ──────────────────────────────────────────────────────────── */
  let search        = $state("");
  let filterCat     = $state("");
  let cartOpen      = $state(false);
  let showCheckout  = $state(false);
  let submitting        = $state(false);
  let showReceipt   = $state(false);
  let scanOpen      = $state(false);
  let lastSaleRef   = $state("");
  let lastSaleTotal = $state(0);
  let lastSaleMethod = $state<PaymentMethod>('cash');
  let lastSaleSplitInfo = $state<string>('');
  let lastSaleCustomer = $state<string>('');
  let discountStr   = $state("");
  let customerSearch = $state("");
  // Payment inputs — always visible, auto-detect method from values
  let cashAmt = $state('');
  let upiAmt = $state('');
  let creditAmt = $state('');
  let roundOff = $state(0);
  // Held-cart sheet
  let showHeld = $state(false);

  // Reactive count of held carts so the "Held (N)" pill updates live.
  // We snapshot from the cart store into a $state value on mount +
  // whenever the held sheet opens, since the cart store's getters
  // read from localStorage and aren't reactive on their own.
  let heldCount = $state(0);
  let heldList: any[] = $state([]);
  function refreshHeld() {
    heldCount = cart.heldCount;
    heldList  = cart.heldCarts;
  }
  // Re-read on mount and whenever the page becomes visible again
  // (covers "user came back to the tab after a long break").
  onMount(refreshHeld);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', refreshHeld);
  }

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
  // Source of truth: the inventory store. The server data is only
  // used to seed the store on first load (handled in the layout /
  // +page.server.ts). Mutations elsewhere (e.g. inventory page)
  // propagate here automatically via the shared store.
  const products = $derived.by(() => {
    let list = invStore.all as any[];
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
  // Source of truth: the customers store. See products block above.
  const filteredCustomers = $derived.by(() => {
    const list = custStore.all as any[];
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

  const grandTotal = $derived.by(() => {
    const sub = cart.subtotal - cart.discountAmount;
    return Math.round(Math.max(0, sub + (data.taxRate > 0 ? sub * (data.taxRate / 100) : 0)) * 100) / 100;
  });

  /** Final total including round-off. */
  const finalTotal = $derived(Math.round((grandTotal + roundOff) * 100) / 100);

  /* ── Helpers ───────────────────────────────────────────────────────────── */
  const PAY_META: Record<PaymentMethod, { icon: any; label: string; tone: 'primary' | 'teal' | 'cobalt' | 'gold' }> = {
    cash:     { icon: Banknote,        label: 'Cash',     tone: 'teal'    },
    credit:   { icon: Clock,           label: 'On credit', tone: 'gold'    },
    transfer: { icon: ArrowLeftRight,  label: 'UPI',      tone: 'primary' },
  };

  // ── Payment inputs: smart redistribution ────────────────────────
  // Cash is always the "remainder". When UPI or Credit changes,
  // Cash is the “remainder” — it auto-adjusts so the sum always equals finalTotal.
  // Hard cap: sum of all three can never exceed finalTotal.

  function onCashInput(raw: string) {
    const credit = parseFloat(creditAmt) || 0;
    const upi    = parseFloat(upiAmt) || 0;
    const maxCash = Math.max(0, finalTotal - credit - upi);
    const val = Math.min(Math.max(0, parseFloat(raw) || 0), maxCash);
    cashAmt = val > 0 ? String(val) : '';
    applySplits();
  }

  function onUpiInput(raw: string) {
    const credit = parseFloat(creditAmt) || 0;
    const maxUpi = Math.max(0, finalTotal - credit);
    const val = Math.min(Math.max(0, parseFloat(raw) || 0), maxUpi);
    upiAmt = val > 0 ? String(val) : '';
    // Cash absorbs the remainder
    const maxCash = Math.max(0, finalTotal - credit - val);
    cashAmt = maxCash > 0 ? String(maxCash) : '';
    applySplits();
  }

  function onCreditInput(raw: string) {
    const upi   = parseFloat(upiAmt) || 0;
    const maxCr = Math.max(0, finalTotal - upi);
    const val = Math.min(Math.max(0, parseFloat(raw) || 0), maxCr);
    creditAmt = val > 0 ? String(val) : '';
    // Cash absorbs the remainder
    const maxCash = Math.max(0, finalTotal - upi - val);
    cashAmt = maxCash > 0 ? String(maxCash) : '';
    applySplits();
  }

  /** Apply splits and auto-set the primary payment method. */
  function applySplits() {
    const cash = parseFloat(cashAmt) || 0;
    const upi  = parseFloat(upiAmt) || 0;
    const credit = parseFloat(creditAmt) || 0;
    cart.clearSplits();
    if (cash > 0) cart.addSplit('cash', cash);
    if (upi > 0) cart.addSplit('transfer', upi);
    if (credit > 0) cart.addSplit('credit', credit);
    // Auto-detect primary method by highest amount
    let method: PaymentMethod = 'cash';
    const max = Math.max(cash, upi, credit);
    if (max === upi) method = 'transfer';
    else if (max === credit) method = 'credit';
    cart.setPaymentMethod(method);
  }

  /** Round grandTotal to nearest ₹1. */
  function autoRoundOff() {
    const rem = grandTotal % 1;
    if (rem === 0) { roundOff = 0; return; }
    roundOff = Math.round((rem >= 0.5 ? (1 - rem) : -rem) * 100) / 100;
  }

  /** Build a human-readable label for the split payment on the receipt. */
  function splitLabel(splits: { method: PaymentMethod; amount: number }[]): string {
    return splits.map((s) => `${PAY_META[s.method]?.label ?? s.method} ${formatCurrency(s.amount)}`).join(' + ');
  }

  /** Remaining amount not yet covered by the split fields. */
  const splitRemainder = $derived.by(() => {
    const used = (parseFloat(cashAmt) || 0)
              + (parseFloat(upiAmt) || 0)
              + (parseFloat(creditAmt) || 0);
    return Math.round((finalTotal - used) * 100) / 100;
  });

  // The cart's checkout button. For credit, ensure a customer is picked.
  function handleCheckoutClick() {
    if (isCreditSale && !cart.customerId) {
      toasts.error('Pick a customer for credit sales first');
      return;
    }
    cartOpen = false;
    showCheckout = true;
  }

  /* ── Unified credit derivations ────────────────────────────────────────
     Credit is now just another payment method — fully handled inside the
     split-payment UI or as a single-method selection. No separate modal.
     We derive everything we need from the cart + split state. */
  /** True when credit is part of this sale (single-method OR split). */
  const isCreditSale = $derived(
    (parseFloat(creditAmt) || 0) > 0
  );

  /** How much is owed on credit (the credit portion of the total). */
  const activeCreditAmount = $derived(
    isCreditSale ? (parseFloat(creditAmt) || 0) : 0
  );

  /** How much was paid upfront (cash + UPI portions). */
  const activeAmountPaid = $derived(
    isCreditSale ? finalTotal - activeCreditAmount : finalTotal
  );

  /** Derived credit status for the backend. */
  const activeCreditStatus = $derived.by((): 'pending' | 'partial' | 'paid' => {
    if (!isCreditSale) return 'paid';
    if (activeAmountPaid >= finalTotal) return 'paid';
    if (activeAmountPaid > 0) return 'partial';
    return 'pending';
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
    if (isCreditSale && !cart.customerId) {
      toasts.error('Pick a customer for credit sales');
      return;
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
      total: finalTotal,
      tax_amount: taxAmount,
      payment_method: cart.paymentMethod,
      payment_splits: cart.hasValidSplits ? cart.paymentSplits : null,
      notes: cart.notes,
      // Optional backdate / clock-skew correction. Null = use now().
      created_at: cart.createdAt,
    };
    // Credit fields — derived from unified credit state.
    if (isCreditSale) {
      payload.credit_status = activeCreditStatus;
      payload.credit_amount_paid = activeAmountPaid;
    }

    // Offline path: queue the sale via offlineFetch, which writes
    // to the generic pending_ops store. The sync engine flushes
    // it when the network returns. We still go through the
    // receipt modal so the cashier has something to show the
    // customer; the receipt is flagged "Pending sync" so the
    // user knows it hasn't reached the server yet.
    if (!offlineSync.online) {
      const clientId = crypto.randomUUID();
      const queuePayload = {
        ...payload,
        client_id: clientId,
        items: payload.items.map((i: any) => ({
          product_id: i.productId,
          name: i.name,
          sku: i.sku,
          qty: i.qty,
          unit_price: i.unitPrice,
        })),
      };
      try {
        const res = await offlineFetch('/api/sales', {
          method: 'POST',
          kind: 'sale',
          headers: { 'Idempotency-Key': clientId },
          body: queuePayload,
        });
        if (res.status === 202) {
          // Queued offline. Reflect the sale in the local stores so
          // the dashboard's today-KPIs and the receipt modal both
          // show the new sale.
          salesStore.add({
            id: clientId,
            sale_ref: `OFFLINE-${Date.now()}`,
            total: finalTotal,
            payment_method: cart.paymentMethod,
            created_at: payload.created_at ?? new Date().toISOString(),
            customer: cart.customerId ? { id: cart.customerId, name: cart.customerName } : null,
            _local: true, _pending: true,
          });
          // Also push a register entry so the cash register page
          // reflects the offline sale immediately.
          regStore.add({
            id:           crypto.randomUUID(),
            destination:  'counter',
            amount:       finalTotal,
            entry_type:   'sale',
            source:       'sale',
            sale_id:      clientId,
            voided_entry_id: null,
            transfer_group_id: null,
            notes:        cart.customerName || null,
            created_at:   payload.created_at ?? new Date().toISOString(),
            effective_at: payload.created_at ?? new Date().toISOString(),
            _local: true, _pending: true,
          });
          for (const item of cart.items) {
            const p = invStore.getById(item.productId);
            if (p) invStore.update(item.productId, { qty: Math.max(0, (p.qty ?? 0) - item.qty) });
          }
          lastSaleRef      = `OFFLINE-${Date.now()}`;
          lastSaleTotal    = finalTotal;
          lastSaleMethod   = cart.paymentMethod;
          lastSaleSplitInfo = '';
          lastSaleCustomer = cart.customerName || 'Walk-in';
          toasts.info("Sale saved offline — will sync when online");
          showCheckout = false;
          showReceipt  = true;
          cart.clear();
        } else {
          const data2 = await res.json().catch(() => ({}));
          toasts.error(data2.error ?? 'Could not save offline');
        }
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
      lastSaleTotal    = finalTotal;
      lastSaleMethod   = cart.paymentMethod;
      lastSaleSplitInfo = cart.hasValidSplits ? splitLabel(cart.paymentSplits) : '';
      lastSaleCustomer = cart.customerName || 'Walk-in';

      // Push the new/edited sale into the sales store so the
      // dashboard's today's revenue / count / list update
      // instantly without a server round-trip.
      salesStore.add({
        ...data2,
        total:        finalTotal,
        payment_method: cart.paymentMethod,
        created_at:   cart.createdAt ?? data2.created_at ?? new Date().toISOString(),
        customer:     cart.customerId ? { id: cart.customerId, name: cart.customerName } : null,
      });

      // Push a sale entry into the register store so the cash
      // register page's balance reflects the sale instantly,
      // without waiting for a page reload.
      const saleId2 = data2.id ?? data2.sale_id;
      if (saleId2) {
        regStore.add({
          id:           crypto.randomUUID(),
          destination:  'counter',
          amount:       finalTotal,
          entry_type:   'sale',
          source:       'sale',
          sale_id:      saleId2,
          voided_entry_id: null,
          transfer_group_id: null,
          notes:        cart.customerName || null,
          created_at:   cart.createdAt ?? data2.created_at ?? new Date().toISOString(),
          effective_at: cart.createdAt ?? data2.created_at ?? new Date().toISOString(),
        });
      }

      // Decrement stock for each cart line in the inventory store
      // so the inventory page's KPIs and the sale page's product
      // list reflect the new stock immediately.
      for (const item of cart.items) {
        const p = invStore.getById(item.productId);
        if (p) invStore.update(item.productId, { qty: Math.max(0, (p.qty ?? 0) - item.qty) });
      }

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

  // ── Hold / resume / discard parked carts ───────────────────
  // The cart store persists held carts to localStorage so a page
  // refresh doesn't lose them. The cashier can resume any held
  // cart from the "Held orders" sheet.
  function holdCart() {
    if (cart.isEmpty) return;
    // Require confirmation so the cashier doesn't accidentally
    // park a cart the customer is still adding to.
    const itemsLabel = cart.count === 1 ? '1 item' : `${cart.count} items`;
    const totalLabel = formatCurrency(cart.total);
    if (!confirm(`Hold this cart (${itemsLabel}, ${totalLabel}) for later? The cart will be cleared and you can resume it from the Held orders sheet.`)) return;
    cart.hold();
    cartOpen = false;          // close the cart sheet
    refreshHeld();
    toasts.info('Cart held. Tap "Held" to resume later.');
  }
  function openHeldSheet() {
    refreshHeld();
    showHeld = true;
  }
  function resumeHeld(id: string) {
    const ok = cart.resume(id);
    if (!ok) {
      toasts.error('Could not resume — cart not found');
      return;
    }
    showHeld = false;
    cartOpen = true;            // open the cart sheet so the cashier can see what's loaded
    refreshHeld();
    toasts.success('Cart resumed');
  }
  function discardHeld(id: string) {
    if (!confirm('Discard this held cart? This cannot be undone.')) return;
    cart.discardHeld(id);
    refreshHeld();
  }

  // Held-cart summary helpers
  function heldSubtotal(h: any): number {
    return h.items.reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
  }
  function heldDiscount(h: any): number {
    if (h.discountType === 'percent') {
      return Math.round(heldSubtotal(h) * h.discountValue / 100);
    }
    return h.discountValue ?? 0;
  }
  function heldTotal(h: any): number {
    return Math.max(0, heldSubtotal(h) - heldDiscount(h));
  }
  function heldAge(h: any): string {
    const ms = Date.now() - new Date(h.heldAt).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1)  return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)  return `${hr} hr ago`;
    const d = Math.floor(hr / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
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
    // Fast path: check local inventory store first (instant, no
    // network).  The layout seeds the store on every page load, so
    // all in-stock products are already in memory.
    const local = invStore.getByBarcode(code);
    if (local) {
      if ((local as any).qty <= 0) {
        toasts.error(`${local.name} is out of stock`);
        return;
      }
      cart.add(local);
      toasts.success(`Added ${local.name}`);
      return;
    }
    // Slow path: product not in local store — fetch from server.
    // This happens when the barcode belongs to a product added on
    // another device that hasn't synced yet.
    try {
      const res = await fetch(`/api/products/by-barcode/${encodeURIComponent(code)}`);
      if (res.ok) {
        const p = await res.json();
        cart.add(p);
        toasts.success(`Added ${p.name}`);
      } else if (res.status === 404) {
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
        <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(finalTotal)}</span>
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

      <!-- Discount + Round-off row -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <p class="input-label mb-1">Discount</p>
          <input
            bind:value={discountStr}
            placeholder="500 or 10%"
            class="input text-sm w-full"
            oninput={applyDiscount}
          />
        </div>
        <div>
          <p class="input-label mb-1">Round-off</p>
          <div class="flex gap-1">
            <input
              type="number"
              step="0.01"
              class="input text-sm flex-1"
              placeholder="0"
              value={roundOff || ''}
              oninput={(e) => { roundOff = parseFloat((e.target as HTMLInputElement).value) || 0; }}
            />
            <button type="button" class="btn btn-secondary text-[10px] px-2" onclick={autoRoundOff} title="Round to nearest ₹1">₹1</button>
          </div>
        </div>
      </div>

      <!-- Payment inputs — always visible, method auto-detected -->
      <div class="rounded-xl p-3 space-y-2" style="background:var(--surface2)">
        <!-- Cash -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-semibold w-14 shrink-0 flex items-center gap-1">
            <Banknote size={11} strokeWidth={2} /> Cash
          </span>
          <input
            type="number" step="0.01" min="0"
            class="input flex-1 text-sm"
            placeholder="0"
            value={cashAmt}
            oninput={(e) => onCashInput((e.target as HTMLInputElement).value)}
          />
        </div>
        <!-- UPI -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-semibold w-14 shrink-0 flex items-center gap-1">
            <ArrowLeftRight size={11} strokeWidth={2} /> UPI
          </span>
          <input
            type="number" step="0.01" min="0"
            class="input flex-1 text-sm"
            placeholder="0"
            value={upiAmt}
            oninput={(e) => onUpiInput((e.target as HTMLInputElement).value)}
          />
        </div>
        <!-- Credit -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-semibold w-14 shrink-0 flex items-center gap-1">
            <Clock size={11} strokeWidth={2} /> Credit
          </span>
          <input
            type="number" step="0.01" min="0"
            class="input flex-1 text-sm"
            placeholder="0"
            value={creditAmt}
            oninput={(e) => onCreditInput((e.target as HTMLInputElement).value)}
          />
        </div>
        <!-- Remainder indicator -->
        {#if splitRemainder !== 0}
          <div class="pt-1 border-t border-[var(--border)]">
            <span class="text-[10px] font-semibold" style="color:var(--crimson-fg)">
              {splitRemainder > 0 ? `Remaining ${formatCurrency(splitRemainder)}` : `Over by ${formatCurrency(Math.abs(splitRemainder))}`}
            </span>
          </div>
        {/if}
      </div>

      <!-- Credit info banner -->
      {#if isCreditSale}
        <div class="rounded-lg p-2.5 flex items-center justify-between gap-2"
             style="background:color-mix(in srgb, var(--gold) 10%, var(--surface));">
          <div class="text-[10.5px]">
            <span style="color:var(--gold-fg); font-weight:600">
              {activeCreditStatus === 'paid' ? 'Paid in full'
                : activeCreditStatus === 'partial' ? 'Partial · ' + formatCurrency(activeCreditAmount) + ' on credit'
                : 'Pending · ' + formatCurrency(finalTotal) + ' due'}
            </span>
            {#if cart.customerId}
              <span class="text-[var(--text-3)] ml-1">· {cart.customerName}</span>
            {:else}
              <span class="ml-1" style="color:var(--crimson-fg); font-weight:600">· pick a customer</span>
            {/if}
          </div>
        </div>
      {/if}

      <div class="flex flex-col gap-1 text-xs">
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
          <span class="tabular-nums" style="color:var(--primary)">{formatCurrency(finalTotal)}</span>
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
          <button
            onclick={holdCart}
            class="btn btn-secondary justify-center px-3"
            aria-label="Hold cart"
            title="Hold cart for later"
          >
            <Pause size={14} strokeWidth={1.75} />
          </button>
        {/if}
        <Button
          onclick={handleCheckoutClick}
          class="flex-1 justify-center"
          size="lg"
          disabled={isCreditSale && !cart.customerId}
        >
          Checkout
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
      <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(finalTotal)}</span>
    </button>
  </div>
{/if}

<!-- Held-carts pill (visible when there are held carts in storage,
     shown above the floating cart pill on both desktop and mobile) -->
{#if heldCount > 0}
  <button
    onclick={openHeldSheet}
    class="fixed right-4 md:right-6 px-3 py-1.5 rounded-full shadow-[var(--shadow-md)] flex items-center gap-1.5 active:scale-95 transition-transform"
    style="bottom: {cart.count > 0 ? (browser ? 'calc(5.5rem + env(safe-area-inset-bottom))' : '5.5rem') : '1.5rem'};
           z-index: 45;
           background:var(--surface);
           border:1px solid var(--border);
           color:var(--text)"
    title="Resume a held cart"
  >
    <Pause size={13} strokeWidth={2.2} class="text-[var(--warning)]" />
    <span class="text-[11px] font-semibold">Held</span>
    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
          style="background:var(--warning); color:var(--warning-fg, white)">
      {heldCount}
    </span>
  </button>
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
      <span class="text-sm font-bold tabular-nums">{formatCurrencyCompact(finalTotal)}</span>
    </button>
  </div>
{/if}

<!-- ─────────────────────────────────────────────────────────────────────────
  CHECKOUT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showCheckout} title={isEdit ? 'Update' : 'Checkout'} maxWidth="max-w-md">
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

    <!-- Payment breakdown -->
    {#if cart.hasValidSplits}
      <div class="rounded-xl p-3 space-y-1.5" style="background:var(--surface2)">
        {#each cart.paymentSplits as sp}
          {@const spm = PAY_META[sp.method]}
          <div class="flex items-center gap-2 text-[11.5px]">
            {#if spm}<spm.icon size={12} strokeWidth={2} />{/if}
            <span class="font-semibold flex-1">{spm?.label ?? sp.method}</span>
            <span class="font-bold tabular-nums">{formatCurrency(sp.amount)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Total -->
    <div class="flex items-center justify-between py-2.5 px-3 rounded-xl" style="background:var(--surface2)">
      <span class="text-[12px] font-semibold text-[var(--text-3)]">Total</span>
      <span class="text-[17px] font-bold tabular-nums" style="color:var(--primary)">{formatCurrency(finalTotal)}</span>
    </div>
    {#if isCreditSale}
      <div class="flex items-center justify-between -mt-1 px-1">
        <span class="text-[11px] text-[var(--text-3)]">On credit</span>
        <span class="text-[11px] font-bold tabular-nums" style="color:var(--crimson-fg)">{formatCurrency(activeCreditAmount)}</span>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button
      loading={submitting}
      disabled={submitting || (isCreditSale && !cart.customerId) || (cart.hasValidSplits && !cart.customerId && isCreditSale)}
      onclick={submitSale}
      class="w-full justify-center"
      size="lg"
    >
      {isEdit ? 'Update Sale' : 'Complete Sale'}
    </Button>
  {/snippet}
</Sheet>
<!-- ─────────────────────────────────────────────────────────────────────────
  RECEIPT MODAL
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showReceipt} title={isEdit ? 'Sale updated' : (lastSaleRef?.startsWith('OFFLINE-') ? 'Saved offline' : 'Sale complete')} maxWidth="max-w-sm">
  <div class="text-center py-3">
    <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
         style="background:var(--teal-dim)">
      <Check size={28} strokeWidth={3} style="color:var(--teal)" />
    </div>
    <p class="text-base font-bold mb-0.5">
      {isEdit ? 'Sale updated' :
        (lastSaleRef?.startsWith('OFFLINE-') ? 'Saved offline' : 'Sale recorded')}
    </p>
    <p class="text-xs text-[var(--text-3)]">
      Ref: <span class="font-mono font-semibold">{lastSaleRef}</span>
      {#if lastSaleRef?.startsWith('OFFLINE-')}
        <span class="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wide"
              style="background:color-mix(in srgb, var(--warning) 16%, transparent); color:var(--warning)">
          <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background:var(--warning)"></span>
          Pending sync
        </span>
      {/if}
    </p>

    <!-- Quick recap -->
    <div class="mt-5 rounded-xl p-3 text-xs space-y-1.5 text-left" style="background:var(--surface2)">
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Customer</span>
        <span class="font-semibold truncate ml-2">{lastSaleCustomer}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Payment</span>
        <span class="font-semibold">{lastSaleSplitInfo || (PAY_META[lastSaleMethod]?.label ?? lastSaleMethod)}</span>
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
  HELD-CARTS SHEET
  Shows the carts that were parked via the "Hold" button on the
  cart sheet. The cashier can resume any of them (replaces the
  current cart) or discard them.
  ───────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showHeld} title="Held carts" maxWidth="max-w-md">
  <div class="space-y-3">
    <p class="text-[11.5px] text-[var(--text-3)]">
      Cart you held to come back to. Tap <strong>Resume</strong> to load it back into the cart, or <strong>Discard</strong> to throw it away.
    </p>

    {#if heldList.length === 0}
      <div class="rounded-xl p-8 text-center" style="background:var(--surface2)">
        <Pause size={28} strokeWidth={1.5} class="mx-auto mb-2" style="color:var(--text-3)" />
        <p class="text-[12.5px] font-semibold mb-1">No held carts</p>
        <p class="text-[11px] text-[var(--text-3)]">
          When a customer has to step aside, hold their cart. It'll show up here.
        </p>
      </div>
    {:else}
      <ul class="space-y-2">
        {#each heldList as h (h.id)}
          {@const itemsLabel = h.items.length === 1 ? '1 item' : `${h.items.length} items`}
          <li class="rounded-xl p-3 space-y-2"
              style="background:var(--surface2)">
            <div class="flex items-center gap-2">
              <Pause size={14} strokeWidth={2} class="shrink-0" style="color:var(--warning)" />
              <div class="flex-1 min-w-0">
                <p class="text-[12.5px] font-semibold">
                  {h.customerName || 'Walk-in customer'}
                </p>
                <p class="text-[10.5px] text-[var(--text-3)]">
                  {itemsLabel} · held {heldAge(h)}
                  {#if h.paymentMethod !== 'cash'}
                    · {h.paymentMethod}
                  {/if}
                </p>
              </div>
              <p class="text-[13px] font-bold tabular-nums">{formatCurrency(heldTotal(h))}</p>
            </div>
            <ul class="text-[10.5px] text-[var(--text-2)] space-y-0.5 pl-5">
              {#each h.items as it}
                <li>· {it.qty}× {it.name}</li>
              {/each}
              {#if heldDiscount(h) > 0}
                <li class="italic text-[var(--text-3)]">discount {formatCurrency(heldDiscount(h))}</li>
              {/if}
            </ul>
            <div class="flex gap-1.5 pt-1">
              <button
                onclick={() => resumeHeld(h.id)}
                class="btn btn-primary flex-1 justify-center"
                style="padding:0.4rem 0.75rem; font-size:11px"
              >
                <Play size={12} strokeWidth={2.2} /> Resume
              </button>
              <button
                onclick={() => discardHeld(h.id)}
                class="btn btn-secondary justify-center"
                style="padding:0.4rem 0.6rem; font-size:11px"
                aria-label="Discard held cart"
              >
                <Trash size={12} strokeWidth={1.75} />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
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