<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { toasts } from "$lib/stores/toast.svelte";
  import { formatCurrency } from "$lib/utils/format";
  import { Trash2, Plus, Search, PackagePlus, ArrowLeft } from "lucide-svelte";

  let { data } = $props();

  // ── Option lists for selects ──────────────────────────────────────────────
  // Convert raw Directus records → { value, label } that our Select expects
  const supplierOptions = $derived(
    (data.suppliers as any[]).map((s) => ({ value: s.id, label: s.name })),
  );
  const categoryOptions = $derived([
    { value: "", label: "No category" },
    ...(data.categories as any[]).map((c) => ({ value: c.id, label: c.name })),
  ]);
  const UNIT_OPTIONS = [
    { value: "piece", label: "Piece" },
    { value: "pack", label: "Pack" },
    { value: "box", label: "Box" },
    { value: "set", label: "Set" },
    { value: "ml", label: "ml" },
    { value: "g", label: "g" },
  ];

  // ── Order header state ────────────────────────────────────────────────────
  let supplierId = $state("");
  let orderDate = $state(new Date().toISOString().split("T")[0]);
  let delivDate = $state("");
  let orderRef = $state("");
  let notes = $state("");

  // ── Line items ────────────────────────────────────────────────────────────
  // ALL monetary values in state are DISPLAY units (e.g. 4500 = ₦4,500).
  // We multiply × 100 → minor units only when posting to the API.
  interface LineItem {
    productId: string;
    productName: string;
    productSku: string;
    qtyOrdered: number;
    unitCostDisp: number; // ₦ display value the user types/sees
    lineTotalDisp: number; // qtyOrdered × unitCostDisp
    isNew: boolean;
  }

  let items = $state<LineItem[]>([]);

  // ── Totals (all display units) ────────────────────────────────────────────
  let taxDisp = $state(0); // user types ₦ display value
  let shippingDisp = $state(0);
  const subtotalDisp = $derived(items.reduce((s, i) => s + i.lineTotalDisp, 0));
  const totalDisp = $derived(
    subtotalDisp + Number(taxDisp || 0) + Number(shippingDisp || 0),
  );

  // ── Product search ────────────────────────────────────────────────────────
  let search = $state("");
  let searchOpen = $state(false);

  const matchedProducts = $derived(
    search.length < 1
      ? []
      : (data.products as any[])
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.toLowerCase()) ||
              p.sku.toLowerCase().includes(search.toLowerCase()),
          )
          .slice(0, 8),
  );

  const noMatch = $derived(
    search.length >= 1 &&
      !(data.products as any[]).some(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()),
      ),
  );

  // Pre-fill product from URL param (?product=id)
  $effect(() => {
    const productId = $page.url.searchParams.get("product");
    if (!productId) return;
    const p = (data.products as any[]).find((x) => x.id === productId);
    if (p) addProduct(p);
  });

  function addProduct(p: any) {
    if (items.some((i) => i.productId === p.id)) {
      toasts.info(`${p.name} is already in the order`);
      return;
    }
    // cost_price from Directus is in minor units → divide by 100 for display
    const costDisp = p.cost_price ? p.cost_price / 100 : 0;
    items = [
      ...items,
      {
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        qtyOrdered: 1,
        unitCostDisp: costDisp,
        lineTotalDisp: costDisp,
        isNew: false,
      },
    ];
    search = "";
    searchOpen = false;
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function updateQty(idx: number, val: string) {
    const qty = Math.max(1, parseInt(val) || 1);
    items = items.map((item, i) =>
      i === idx
        ? { ...item, qtyOrdered: qty, lineTotalDisp: qty * item.unitCostDisp }
        : item,
    );
  }

  function updateCost(idx: number, val: string) {
    const cost = parseFloat(val) || 0;
    items = items.map((item, i) =>
      i === idx
        ? { ...item, unitCostDisp: cost, lineTotalDisp: item.qtyOrdered * cost }
        : item,
    );
  }

  // ── New product modal ─────────────────────────────────────────────────────
  let showNewProduct = $state(false);
  let newProd = $state({
    name: "",
    sku: "",
    category: "",
    unit: "piece",
    price: "",
    cost_price: "",
    low_stock_threshold: "10",
  });
  let savingProduct = $state(false);

  async function createAndAdd() {
    if (!newProd.name.trim() || !newProd.sku.trim()) {
      toasts.error("Product name and SKU are required");
      return;
    }
    savingProduct = true;
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProd.name,
          sku: newProd.sku,
          category: newProd.category || null,
          unit: newProd.unit,
          price: Math.round(parseFloat(newProd.price || "0") * 100),
          cost_price: Math.round(parseFloat(newProd.cost_price || "0") * 100),
          low_stock_threshold: parseInt(newProd.low_stock_threshold || "10"),
          qty: 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toasts.error(d.error ?? "Failed to create product");
        return;
      }
      const product = await res.json();
      // Add to items with the cost from the form (already in display units)
      const costDisp = parseFloat(newProd.cost_price || "0");
      items = [
        ...items,
        {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          qtyOrdered: 1,
          unitCostDisp: costDisp,
          lineTotalDisp: costDisp,
          isNew: true,
        },
      ];
      showNewProduct = false;
      newProd = {
        name: "",
        sku: "",
        category: "",
        unit: "piece",
        price: "",
        cost_price: "",
        low_stock_threshold: "10",
      };
      toasts.success("Product created and added to order");
    } finally {
      savingProduct = false;
    }
  }

  // ── Save order ────────────────────────────────────────────────────────────
  let saving = $state(false);

  async function saveOrder(status: "draft" | "ordered") {
    if (!supplierId) {
      toasts.error("Please select a supplier");
      return;
    }
    if (!items.length) {
      toasts.error("Add at least one item");
      return;
    }

    saving = true;
    try {
      // All monetary fields → minor units (× 100) before hitting the API
      const subtotalMinor = Math.round(subtotalDisp * 100);
      const taxMinor = Math.round(Number(taxDisp || 0) * 100);
      const shippingMinor = Math.round(Number(shippingDisp || 0) * 100);
      const totalMinor = subtotalMinor + taxMinor + shippingMinor;

      const poRes = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: supplierId,
          order_ref: orderRef || undefined,
          status,
          order_date: orderDate,
          expected_delivery_date: delivDate || null,
          subtotal: subtotalMinor,
          tax_amount: taxMinor,
          shipping_cost: shippingMinor,
          total_cost: totalMinor,
          notes: notes || null,
        }),
      });

      if (!poRes.ok) {
        const d = await poRes.json().catch(() => ({}));
        toasts.error(d.error ?? "Failed to create purchase order");
        return;
      }
      const po = await poRes.json();

      // Post each line item — unit_cost and line_total in minor units
      for (const item of items) {
        const unitCostMinor = Math.round(item.unitCostDisp * 100);
        const lineTotalMinor = Math.round(item.lineTotalDisp * 100);

        await fetch(`/api/purchase-orders/${po.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: item.productId,
            product_name: item.productName,
            product_sku: item.productSku,
            quantity_ordered: item.qtyOrdered,
            quantity_received: 0,
            unit_cost: unitCostMinor,
            line_total: lineTotalMinor,
            is_new_product: item.isNew,
          }),
        });
      }

      toasts.success(status === "draft" ? "Draft saved" : "Order placed");
      goto(
        status === "draft"
          ? "/restocking/orders"
          : `/restocking/orders/${po.id}`,
      );
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>New Purchase Order · Shëlf</title></svelte:head>

<PageShell>
  <!-- Header -->
  <div class="page-header mb-6">
    <div class="flex items-center gap-3 flex-1">
      <a href="/restocking" class="btn btn-ghost btn-icon btn-sm">
        <ArrowLeft size={16} strokeWidth={1.75} />
      </a>
      <div>
        <p class="text-base font-semibold">New Purchase Order</p>
        <p class="text-xs text-[var(--text-3)]">
          Record incoming stock from a supplier
        </p>
      </div>
    </div>
  </div>

  <div class="flex flex-col gap-5 max-w-4xl mx-auto">
    <!-- ── Order details card ───────────────────────────────────────────── -->
    <div class="card p-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-4">
        Order details
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex flex-col gap-4">
          <!-- Supplier select — correct { value, label } options -->
          {#if supplierOptions.length === 0}
            <div class="input-group">
              <p class="input-label">Supplier</p>
              <div
                class="bg-[var(--surface2)] rounded-lg p-3 text-xs text-[var(--text-3)] flex items-center justify-between"
              >
                No suppliers yet
                <a
                  href="/restocking/suppliers"
                  class="text-[var(--primary)] hover:underline font-semibold"
                >
                  Add one →
                </a>
              </div>
            </div>
          {:else}
            <Select
              label="Supplier"
              bind:value={supplierId}
              options={supplierOptions}
              required
            />
          {/if}
          <div class="grid grid-cols-2 gap-3">
            <Input
              label="Order date"
              type="date"
              bind:value={orderDate}
              required
            />
            <Input
              label="Expected delivery"
              type="date"
              bind:value={delivDate}
            />
          </div>
        </div>
        <div class="flex flex-col gap-4">
          <Input
            label="Order reference"
            placeholder="Auto-generated if blank"
            bind:value={orderRef}
          />
          <div class="input-group">
            <label class="input-label">Notes</label>
            <textarea
              bind:value={notes}
              class="input"
              rows="3"
              placeholder="Internal notes about this order…"
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Items card ───────────────────────────────────────────────────── -->
    <div class="card overflow-visible">
      <div
        class="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3"
      >
        <p class="text-xs font-semibold text-[var(--text-2)]">Order items</p>
        <!-- Product search -->
        <div class="relative w-64">
          <div class="relative">
            <Search
              size={13}
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              bind:value={search}
              onfocus={() => (searchOpen = true)}
              oninput={() => (searchOpen = true)}
              placeholder="Search product to add…"
              class="input pl-8 text-xs"
            />
          </div>

          {#if searchOpen && search.length >= 1}
            <div
              class="absolute top-full left-0 right-0 mt-1 card shadow-[var(--shadow-lg)] z-50 max-h-56 overflow-y-auto"
            >
              {#if matchedProducts.length > 0}
                {#each matchedProducts as p}
                  <button
                    class="w-full text-left px-3 py-2.5 hover:bg-[var(--surface2)] border-b last:border-0 border-[var(--border)] transition-colors"
                    onclick={() => addProduct(p)}
                  >
                    <p class="text-xs font-semibold">{p.name}</p>
                    <p class="text-[10px] text-[var(--text-3)]">
                      {p.sku}
                      {#if p.cost_price > 0}
                        · Last cost: {formatCurrency(p.cost_price)}{/if}
                    </p>
                  </button>
                {/each}
              {/if}
              {#if noMatch || matchedProducts.length === 0}
                <button
                  class="w-full text-left px-3 py-2.5 text-[var(--primary)] text-xs font-semibold hover:bg-[var(--surface2)] flex items-center gap-2"
                  onclick={() => {
                    showNewProduct = true;
                    searchOpen = false;
                    search = "";
                  }}
                >
                  <Plus size={13} strokeWidth={2} /> Create new product and add
                </button>
              {/if}
            </div>
            <!-- Click-away overlay -->
            <div
              class="fixed inset-0 z-40"
              onclick={() => (searchOpen = false)}
            ></div>
          {/if}
        </div>
      </div>

      {#if items.length === 0}
        <EmptyState
          icon="PackagePlus"
          title="No items yet"
          message="Search for a product above to add it to this order."
          class="py-12"
        />
      {:else}
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th class="text-center w-24">Qty ordered</th>
                <th class="text-center w-36">Unit cost (₦)</th>
                <th class="text-right w-32">Line total</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {#each items as item, i}
                <tr>
                  <td>
                    <p class="text-xs font-semibold">{item.productName}</p>
                    <p class="text-[10px] text-[var(--text-3)]">
                      {item.productSku}
                    </p>
                    {#if item.isNew}
                      <span class="badge badge-cobalt text-[9px] mt-0.5"
                        >New product</span
                      >
                    {/if}
                  </td>
                  <td class="text-center">
                    <input
                      type="number"
                      value={item.qtyOrdered}
                      min="1"
                      class="input text-center w-20 mx-auto text-xs py-1.5"
                      oninput={(e) =>
                        updateQty(i, (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td class="text-center">
                    <!-- User types ₦ display amount, e.g. 4500 for ₦4,500 -->
                    <input
                      type="number"
                      value={item.unitCostDisp}
                      min="0"
                      step="0.01"
                      class="input text-center w-28 mx-auto text-xs py-1.5"
                      oninput={(e) =>
                        updateCost(i, (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td class="text-right text-xs font-semibold">
                    <!-- lineTotalDisp is display units → pass × 100 to formatCurrency -->
                    {formatCurrency(Math.round(item.lineTotalDisp * 100))}
                  </td>
                  <td>
                    <button
                      class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)] mx-auto block"
                      onclick={() => removeItem(i)}
                      title="Remove"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Mobile item cards -->
        <div class="md:hidden flex flex-col divide-y divide-[var(--border)]">
          {#each items as item, i}
            <div class="p-4 flex flex-col gap-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-xs font-semibold">{item.productName}</p>
                  <p class="text-[10px] text-[var(--text-3)]">
                    {item.productSku}
                  </p>
                </div>
                <button
                  class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]"
                  onclick={() => removeItem(i)}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="input-group">
                  <label class="input-label">Qty</label>
                  <input
                    type="number"
                    value={item.qtyOrdered}
                    min="1"
                    class="input text-xs py-1.5"
                    oninput={(e) =>
                      updateQty(i, (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="input-group">
                  <label class="input-label">Unit cost (₦)</label>
                  <input
                    type="number"
                    value={item.unitCostDisp}
                    min="0"
                    step="0.01"
                    class="input text-xs py-1.5"
                    oninput={(e) =>
                      updateCost(i, (e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>
              <div class="flex justify-end text-xs font-semibold">
                Total: {formatCurrency(Math.round(item.lineTotalDisp * 100))}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Totals + actions ──────────────────────────────────────────────── -->
    <div class="flex justify-end">
      <div class="card p-5 w-full md:w-80 flex flex-col gap-3">
        <p class="text-xs font-semibold text-[var(--text-2)] mb-1">
          Order total
        </p>

        <div class="flex justify-between items-center text-xs">
          <span class="text-[var(--text-3)]">Subtotal</span>
          <span class="font-medium"
            >{formatCurrency(Math.round(subtotalDisp * 100))}</span
          >
        </div>

        <div class="flex items-center justify-between gap-3 text-xs">
          <span class="text-[var(--text-3)] flex-shrink-0">Tax (₦)</span>
          <input
            type="number"
            bind:value={taxDisp}
            min="0"
            step="0.01"
            placeholder="0.00"
            class="input text-right text-xs py-1.5 w-28"
          />
        </div>

        <div class="flex items-center justify-between gap-3 text-xs">
          <span class="text-[var(--text-3)] flex-shrink-0">Shipping (₦)</span>
          <input
            type="number"
            bind:value={shippingDisp}
            min="0"
            step="0.01"
            placeholder="0.00"
            class="input text-right text-xs py-1.5 w-28"
          />
        </div>

        <div
          class="border-t border-[var(--border)] pt-3 flex justify-between items-center"
        >
          <span class="text-sm font-semibold">Total investment</span>
          <span class="text-base font-bold" style="color:var(--primary)">
            {formatCurrency(Math.round(totalDisp * 100))}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="secondary"
            onclick={() => saveOrder("draft")}
            loading={saving}
          >
            Save draft
          </Button>
          <Button onclick={() => saveOrder("ordered")} loading={saving}>
            Mark ordered
          </Button>
        </div>
      </div>
    </div>
  </div>
</PageShell>

<!-- ─── Modals OUTSIDE PageShell to escape transform containing block ──────── -->

<Modal
  bind:open={showNewProduct}
  title="Create new product"
  maxWidth="max-w-sm"
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      createAndAdd();
    }}
    class="flex flex-col gap-3"
  >
    <Input label="Product name" bind:value={newProd.name} required />
    <div class="grid grid-cols-2 gap-3">
      <Input label="SKU" bind:value={newProd.sku} required />
      <Select label="Unit" bind:value={newProd.unit} options={UNIT_OPTIONS} />
    </div>
    <Select
      label="Category"
      bind:value={newProd.category}
      options={categoryOptions}
    />
    <div class="grid grid-cols-2 gap-3">
      <Input
        label="Selling price (₦)"
        type="number"
        bind:value={newProd.price}
        placeholder="0.00"
      />
      <Input
        label="Unit cost (₦)"
        type="number"
        bind:value={newProd.cost_price}
        placeholder="0.00"
      />
    </div>
    <Input
      label="Low-stock alert at"
      type="number"
      bind:value={newProd.low_stock_threshold}
      hint="e.g. 5 units"
    />
    <p
      class="text-[10px] text-[var(--text-3)] bg-[var(--surface2)] rounded-lg p-2"
    >
      The product will be created with 0 stock. Qty updates automatically when
      you receive this order.
    </p>
  </form>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => (showNewProduct = false)}
        >Cancel</Button
      >
      <Button loading={savingProduct} onclick={createAndAdd}>
        <PackagePlus size={14} strokeWidth={1.75} /> Create & add
      </Button>
    </div>
  {/snippet}
</Modal>
