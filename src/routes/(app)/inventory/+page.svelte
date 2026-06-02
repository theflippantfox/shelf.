<script lang="ts">
  import { page }       from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';
  import { auth }       from '$lib/stores/auth.svelte';
  import { toasts }     from '$lib/stores/toast.svelte';
  import { inventory as invStore } from '$lib/stores/inventory.svelte';
  import PageShell   from '$lib/components/layout/PageShell.svelte';
  import SearchBar   from '$lib/components/ui/SearchBar.svelte';
  import Button      from '$lib/components/ui/Button.svelte';
  import Modal       from '$lib/components/ui/Modal.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import Input       from '$lib/components/ui/Input.svelte';
  import Select      from '$lib/components/ui/Select.svelte';
  import EmptyState  from '$lib/components/ui/EmptyState.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { Plus, Pencil, PackagePlus, Trash2 } from 'lucide-svelte';
  import { appConfig } from '$lib/config/app';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  $effect(() => { invStore.init(data.products as any[]); });

  let search      = $state('');
  let filterCat   = $state('');
  let filterAlert = $state($page.url.searchParams.get('filter') === 'alerts');
  let showAdd     = $state(false);
  let showDelete  = $state(false);          // ← dedicated boolean for ConfirmModal
  let editTarget  = $state<any>(null);
  let deleteTarget = $state<any>(null);     // ← holds the product being deleted
  let saving      = $state(false);

  let form = $state({
    name: '', sku: '', price: '', cost_price: '',
    qty: '', unit: 'piece', category: '', description: '', low_stock_threshold: '',
  });
  let restockDelta = $state<number>(10);

  const filtered = $derived(() => {
    let list = data.products as any[];
    if (filterCat) list = list.filter(p => {
      const catId = typeof p.category === 'string' ? p.category : p.category?.id;
      return catId === filterCat;
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    if (filterAlert) list = list.filter(p =>
      p.qty === 0 || p.qty <= (p.low_stock_threshold ?? data.threshold)
    );
    return list;
  });

  function getStockBadge(p: any) {
    if (p.qty === 0) return { label: 'Out of stock', cls: 'badge-crimson' };
    if (p.qty <= (p.low_stock_threshold ?? data.threshold)) return { label: `Low — ${p.qty}`, cls: 'badge-gold' };
    return { label: String(p.qty), cls: 'badge-neutral' };
  }

  function openAdd() {
    form = { name: '', sku: '', price: '', cost_price: '', qty: '0', unit: 'piece', category: '', description: '', low_stock_threshold: '' };
    editTarget = null; showAdd = true;
  }

  function openEdit(p: any) {
    form = {
      name: p.name, sku: p.sku,
      price:      String(p.price / 100),
      cost_price: String(p.cost_price / 100),
      qty:        String(p.qty),
      unit:       p.unit,
      category:   p.category?.id ?? p.category ?? '',
      description: p.description ?? '',
      low_stock_threshold: p.low_stock_threshold ? String(p.low_stock_threshold) : '',
    };
    editTarget = p; showAdd = true;
  }

  function confirmDelete(p: any) {
    deleteTarget = p;
    showDelete   = true;   // ← set the boolean to open the modal
  }

  async function saveProduct() {
    saving = true;
    const payload = {
      name:                form.name,
      sku:                 form.sku,
      price:               Math.round(parseFloat(form.price  || '0') * 100),
      cost_price:          Math.round(parseFloat(form.cost_price || '0') * 100),
      qty:                 parseInt(form.qty || '0'),
      unit:                form.unit,
      category:            form.category || null,
      description:         form.description || null,
      low_stock_threshold: form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
    };
    const url    = editTarget ? `/api/products/${editTarget.id}` : '/api/products';
    const method = editTarget ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toasts.success(editTarget ? 'Product updated' : 'Product added');
      showAdd = false;
      await invalidateAll();
    } else toasts.error('Failed to save product');
    saving = false;
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      toasts.success('Product archived');
      showDelete = false;
      deleteTarget = null;
      await invalidateAll();
    } else toasts.error('Failed to archive');
  }

  const catOptions = $derived([
    { value: '', label: 'All categories' },
    ...(data.categories as any[]).map((c: any) => ({ value: c.id, label: c.name })),
  ]);
  const unitOptions = appConfig.inventory.units.map(u => ({ value: u, label: u }));
</script>

<svelte:head><title>Inventory · Shëlf</title></svelte:head>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Inventory</p>
      <p class="text-xs text-[var(--text-3)]">{(data.products as any[]).length} products</p>
    </div>
    {#if auth.can('inventory.manage')}
      <Button onclick={openAdd} size="sm"><Plus size={14} strokeWidth={2} /> Add product</Button>
    {/if}
  </div>

  <div class="flex gap-2 mb-4">
    <SearchBar bind:value={search} placeholder="Search products…" class="flex-1" />
    <select class="input" style="width:auto;min-width:0" bind:value={filterCat}>
      {#each catOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
    </select>
  </div>

  {#if invStore.alertCount > 0}
    <button
      class="badge mb-4 cursor-pointer {filterAlert ? 'badge-crimson' : 'badge-neutral'}"
      onclick={() => filterAlert = !filterAlert}
    >
      {invStore.alertCount} stock alert{invStore.alertCount > 1 ? 's' : ''}
    </button>
  {/if}

  {#if filtered().length === 0}
    <EmptyState icon="Package" title="No products found" message="Try adjusting your search or add a product.">
      {#snippet action()}
        {#if auth.can('inventory.manage')}
          <Button onclick={openAdd} size="sm"><Plus size={14} strokeWidth={2} /> Add first product</Button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <div class="card overflow-hidden">
      <table class="tbl">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
            {#if auth.can('inventory.manage')}<th></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each filtered() as p}
            {@const badge = getStockBadge(p)}
            <tr>
              <td>
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                       style="background:color-mix(in srgb,{p.category?.color ?? 'var(--primary)'} 15%,transparent)">
                    <DynamicIcon name={p.category?.icon ?? 'Package'} size={13}
                                 style="color:{p.category?.color ?? 'var(--primary)'}" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold">{p.name}</p>
                    <p class="text-[10px] text-[var(--text-3)]">{p.sku}</p>
                  </div>
                </div>
              </td>
              <td class="text-xs">{formatCurrency(p.price)}</td>
              <td><span class="badge {badge.cls} text-[10px]">{badge.label}</span></td>
              {#if auth.can('inventory.manage')}
                <td>
                  <div class="flex items-center gap-1 justify-end">
                    <button class="btn btn-ghost btn-icon btn-sm"
                      title="Restock"
                      onclick={() => { window.location.href = `/restocking/orders/new?product=${p.id}`; }}>
                      <PackagePlus size={14} strokeWidth={1.75} />
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick={() => openEdit(p)}>
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]"
                      title="Archive" onclick={() => confirmDelete(p)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</PageShell>

<!-- Add / Edit modal -->
<Modal bind:open={showAdd} title={editTarget ? 'Edit product' : 'Add product'} maxWidth="max-w-lg">
  <form onsubmit={(e) => { e.preventDefault(); saveProduct(); }} class="flex flex-col gap-3">
    <Input label="Name" bind:value={form.name} required />
    <div class="grid grid-cols-2 gap-3">
      <Input label="SKU"  bind:value={form.sku}  required />
      <Select label="Unit" bind:value={form.unit} options={unitOptions} />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Input label="Selling price" type="number" bind:value={form.price}      hint="e.g. 25.00" required />
      <Input label="Cost price"    type="number" bind:value={form.cost_price} hint="optional" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Input label="Qty in stock"         type="number" bind:value={form.qty} />
      <Input label="Low-stock alert at"   type="number" bind:value={form.low_stock_threshold} hint="e.g. 5" />
    </div>
    <Select label="Category" bind:value={form.category}
      options={[{ value: '', label: 'No category' },
                ...(data.categories as any[]).map((c: any) => ({ value: c.id, label: c.name }))]} />
    <div class="input-group">
      <label class="input-label">Description</label>
      <textarea bind:value={form.description} class="input" rows="2" placeholder="Optional notes"></textarea>
    </div>
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showAdd = false}>Cancel</Button>
      <Button loading={saving} onclick={saveProduct}>Save product</Button>
    </div>
  {/snippet}
</Modal>

<!-- Archive confirm — uses a plain boolean now ✅ -->
<ConfirmModal
  bind:open={showDelete}
  title="Archive product"
  message="Archive {deleteTarget?.name ?? 'this product'}? Sales history is preserved — it just won't appear in the POS."
  danger
  onconfirm={doDelete}
  oncancel={() => { showDelete = false; deleteTarget = null; }}
/>
