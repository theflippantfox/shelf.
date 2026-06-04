<script lang="ts">
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { page } from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';

  let suppliers: any[] = [];
  let products: any[] = [];
  let loading = true;

  let order = {
    supplier: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    order_ref: '',
    notes: '',
    tax_amount: 0,
    shipping_cost: 0,
    status: 'draft',
  };

  let items: any[] = [];
  let newItemSearch = '';
  let isAddingProduct = false;
  let newProduct = {
    name: '',
    sku: '',
    category: '',
    unit: 'piece',
    price: 0,
    cost_price: 0,
    low_stock_threshold: 10,
  };

  onMount(async () => {
    try {
      const productId = $page.url.searchParams.get('product');
      if (productId) {
        const p = await api('GET', `/api/products/${productId}`);
        if (p) addItem(p as any);
      }

      const [s, p] = await Promise.all([
        api('GET', '/api/suppliers'),
        api('GET', '/api/products')
      ]);
      suppliers = s || [];
      products = p || [];
    } catch (e) {
      toasts.error('Failed to load data');
    } finally {
      loading = false;
    }
  });

  function addItem(product: any) {
    const exists = items.find(i => i.product === product.id);
    if (exists) {
      exists.quantity_ordered += 1;
      exists.line_total = exists.quantity_ordered * exists.unit_cost;
    } else {
      items = [...items, {
        product: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity_ordered: 1,
        unit_cost: product.cost_price || 0,
        line_total: product.cost_price || 0,
        notes: '',
      }];
    }
    newItemSearch = '';
  }

  function removeItem(index: number) {
    items = items.filter((_, i) => i !== index);
  }

  function updateItem(index: number, field: string, value: any) {
    items[index][field] = value;
    if (field === 'quantity_ordered' || field === 'unit_cost') {
      items[index].line_total = items[index].quantity_ordered * items[index].unit_cost;
    }
    items = [...items];
  }

  async function handleCreateProduct() {
    try {
      const p = await api('POST', '/api/products', newProduct);
      if (p) addItem(p as any);
      isAddingProduct = false;
      newProduct = { name: '', sku: '', category: '', unit: 'piece', price: 0, cost_price: 0, low_stock_threshold: 10 };
      toasts.success('Product created');
    } catch (e) {
      toasts.error('Failed to create product');
    }
  }

  async function saveOrder(status: string = 'draft') {
    if (!order.supplier) return toasts.error('Please select a supplier');
    if (items.length === 0) return toasts.error('Add at least one item');

    try {
      const payload = {
        ...order,
        status,
      };
      
      const po = await api('POST', '/api/purchase-orders', payload);
      if (!po) throw new Error('Failed to create PO');

      for (const item of items) {
        await api('POST', `/api/purchase-orders/${po.id}/items`, item);
      }

      toasts.success(`Order ${status === 'draft' ? 'saved as draft' : 'placed'}`);
      if (status === 'ordered') {
        window.location.href = `/restocking/orders/${po.id}`;
      }
    } catch (e) {
      toasts.error('Failed to save order');
    }
  }

  $: subtotal = items.reduce((sum, i) => sum + (i.line_total || 0), 0);
  $: total = subtotal + Number(order.tax_amount || 0) + Number(order.shipping_cost || 0);
</script>

<PageShell title="New Purchase Order">
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">New Purchase Order</p>
      <p class="text-xs text-[var(--text-3)]">Add new stock to your inventory</p>
    </div>
    <Button variant="ghost" href="/restocking" size="sm">Cancel</Button>
  </div>

  <div class="max-w-4xl mx-auto p-4 space-y-6">
    
    <!-- Order Header -->
    <div class="card p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-4">
        <Select label="Supplier" bind:value={order.supplier} options={suppliers} optionLabel="name" optionValue="id" />
        <div class="grid grid-cols-2 gap-4">
          <Input label="Order Date" type="date" bind:value={order.order_date} />
          <Input label="Expected Delivery" type="date" bind:value={order.expected_delivery_date} />
        </div>
      </div>
      <div class="space-y-4">
        <Input label="Order Reference" placeholder="PO-2025-001" bind:value={order.order_ref} />
        <Input label="Notes" placeholder="Add internal notes..." bind:value={order.notes} />
      </div>
    </div>

    <!-- Items Table -->
    <div class="card overflow-hidden">
      <div class="p-4 border-b border-[var(--border)] flex justify-between items-center bg-muted/30">
        <h3 class="font-semibold text-sm">Order Items</h3>
        <div class="relative w-64">
          <Input 
            placeholder="Search product to add..." 
            bind:value={newItemSearch} 
            on:keydown={(e) => e.key === 'Enter' && addItem(products.find(p => p.name === newItemSearch))} 
          />
          {#if newItemSearch && products.length > 0}
            <div class="absolute top-full left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto mt-1">
              {#each products.filter(p => p.name.toLowerCase().includes(newItemSearch.toLowerCase())) as p}
                <button 
                  class="w-full text-left p-3 hover:bg-muted border-b border-border last:border-0"
                  on:click={() => addItem(p)}
                >
                  <div class="font-medium text-xs">{p.name}</div>
                  <div class="text-[10px] text-muted-foreground">{p.sku} · Cost: {formatCurrency(p.cost_price)}</div>
                </button>
              {/each}
              {#if !products.some(p => p.name.toLowerCase().includes(newItemSearch.toLowerCase()))}
                <button 
                  class="w-full text-left p-3 text-primary font-medium hover:bg-muted text-xs"
                  on:click={() => isAddingProduct = true}
                >
                  + Add as new product
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <table class="tbl">
        <thead>
          <tr>
            <th>Product</th>
            <th class="w-24 text-center">Qty</th>
            <th class="w-32 text-center">Unit Cost</th>
            <th class="w-32 text-right">Total</th>
            <th class="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, i}
            <tr>
              <td>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold">{item.product_name}</span>
                  <span class="text-[10px] text-[var(--text-3)]">{item.product_sku}</span>
                </div>
              </td>
              <td class="text-center">
                <Input type="number" class="h-8 w-16 mx-auto text-center" bind:value={item.quantity_ordered} on:input={() => updateItem(i, 'quantity_ordered', item.quantity_ordered)} />
              </td>
              <td class="text-center">
                <Input type="number" class="h-8 w-24 mx-auto text-center" bind:value={item.unit_cost} on:input={() => updateItem(i, 'unit_cost', item.unit_cost)} />
              </td>
              <td class="text-right font-medium text-xs">
                {formatCurrency(item.line_total)}
              </td>
              <td class="text-right">
                <Button variant="ghost" class="p-1 h-8 w-8 text-danger" onclick={() => removeItem(i)}>×</Button>
              </td>
            </tr>
          {/each}
          {#if items.length === 0}
            <tr>
              <td colspan="5" class="p-8 text-center text-muted-foreground text-xs">
                No items added. Search for products to begin.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Totals & Actions -->
    <div class="flex justify-end">
      <div class="card p-6 w-full md:w-80 space-y-4">
        <div class="flex justify-between text-xs text-[var(--text-3)]">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div class="flex justify-between items-center gap-4">
          <span class="text-xs text-[var(--text-3)]">Tax</span>
          <Input type="number" class="h-8 w-24 text-right" bind:value={order.tax_amount} />
        </div>
        <div class="flex justify-between items-center gap-4">
          <span class="text-xs text-[var(--text-3)]">Shipping</span>
          <Input type="number" class="h-8 w-24 text-right" bind:value={order.shipping_cost} />
        </div>
        <div class="border-t border-[var(--border)] pt-4 flex justify-between items-center text-sm font-bold">
          <span>Total Investment</span>
          <span class="text-primary">{formatCurrency(total)}</span>
        </div>
        <div class="grid grid-cols-2 gap-3 pt-4">
          <Button variant="secondary" onclick={() => saveOrder('draft')}>Save Draft</Button>
          <Button variant="primary" onclick={() => saveOrder('ordered')}>Mark as Ordered</Button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Product Modal -->
  <Modal bind:open={isAddingProduct} title="Add New Product" maxWidth="max-w-sm">
    <div class="flex flex-col gap-4 p-2">
      <Input label="Product Name" bind:value={newProduct.name} required />
      <Input label="SKU" bind:value={newProduct.sku} required />
      <Select label="Category" bind:value={newProduct.category} options={products.filter(p => p.category).map(p => p.category)} />
      <div class="grid grid-cols-2 gap-4">
        <Input label="Selling Price" type="number" bind:value={newProduct.price} />
        <Input label="Unit Cost" type="number" bind:value={newProduct.cost_price} />
      </div>
      <Input label="Low Stock Alert" type="number" bind:value={newProduct.low_stock_threshold} />
      <div class="flex justify-end gap-3 pt-4">
        <Button variant="ghost" onclick={() => isAddingProduct = false}>Cancel</Button>
        <Button variant="primary" onclick={handleCreateProduct}>Add to Order</Button>
      </div>
    </div>
  </Modal>
</PageShell>
