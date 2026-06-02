<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fetch } from './api-client';

  let suppliers = [];
  let products = [];
  let selectedSupplier = '';
  let orderDate = new Date().toISOString().split('T')[0];
  let orderRef = '';
  let items = [];
  let loading = true;

  async function loadInitialData() {
    try {
      const [supRes, prodRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch('/api/products') // Assume this exists
      ]);
      suppliers = await supRes.json();
      products = await prodRes.json();
    } catch (e) {
      console.error('Initialization failed:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadInitialData();
    
    // Handle pre-filled product from URL
    const productId = $page.url.searchParams.get('product');
    if (productId) {
      const product = products.find(p => p.id === productId);
      if (product) {
        addItem(product);
      }
    }
  });

  function addItem(product = null) {
    items = [...items, {
      id: crypto.randomUUID(),
      product: product?.id || '',
      name: product?.name || '',
      sku: product?.sku || '',
      qty: 1,
      cost: 0,
      notes: ''
    }];
  }

  function removeItem(id) {
    items = items.filter(i => i.id !== id);
  }

  async function saveOrder() {
    if (!selectedSupplier || items.length === 0) {
      alert('Please select a supplier and add at least one item.');
      return;
    }

    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplier: selectedSupplier,
          order_date: orderDate,
          order_ref: orderRef,
          items: items.map(i => ({
            product: i.product,
            product_name: i.name,
            product_sku: i.sku,
            quantity_ordered: i.qty,
            unit_cost: i.cost,
            notes: i.notes
          }))
        })
      });
      
      if (res.ok) {
        const po = await res.json();
        goto(`/restocking/orders/${po.id}/receive`);
      }
    } catch (e) {
      console.error('Save failed:', e);
    }
  }
</script>

<div class="p-6 max-w-4xl mx-auto">
  <header class="flex justify-between items-center mb-8">
    <h1 class="text-2xl font-bold text-slate-900">New Purchase Order</h1>
    <button on:click={() => goto('/restocking')} class="text-slate-500 hover:text-slate-700">Cancel</button>
  </header>

  {#if loading}
    <div class="text-center p-12 text-slate-400">Loading...</div>
  {:else}
    <div class="space-y-8">
      <!-- Order Metadata -->
      <section class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Supplier</label>
          <select bind:value={selectedSupplier} class="w-full border border-slate-300 rounded-lg p-2">
            <option value="">Select Supplier...</option>
            {#each suppliers as s}
              <option value={s.id}>{s.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Order Date</label>
          <input type="date" bind:value={orderDate} class="w-full border border-slate-300 rounded-lg p-2" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Order Ref (Optional)</label>
          <input type="text" bind:value={orderRef} placeholder="PO-XXXX" class="w-full border border-slate-300 rounded-lg p-2" />
        </div>
      </section>

      <!-- Items Table -->
      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase">Product</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-24">Qty</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-32">Unit Cost</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-32">Total</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-16"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            {#each items as item}
              <tr>
                <td class="p-4">
                  <select bind:value={item.product} on:change={() => {
                    const p = products.find(prod => prod.id === item.product);
                    item.name = p?.name || '';
                    item.sku = p?.sku || '';
                  }} class="w-full border border-slate-300 rounded-lg p-2">
                    <option value="">Select Product...</option>
                    {#each products as p}
                      <option value={p.id}>{p.name} ({p.sku})</option>
                    {/each}
                  </select>
                </td>
                <td class="p-4">
                  <input type="number" bind:value={item.qty} class="w-full border border-slate-300 rounded-lg p-2" />
                </td>
                <td class="p-4">
                  <input type="number" bind:value={item.cost} class="w-full border border-slate-300 rounded-lg p-2" />
                </td>
                <td class="p-4 font-medium text-slate-700">
                  ₦{(item.qty * item.cost / 100).toLocaleString()}
                </td>
                <td class="p-4">
                  <button on:click={() => removeItem(item.id)} class="text-red-500 hover:text-red-700">✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="p-4 bg-slate-50 border-t border-slate-200">
          <button on:click={() => addItem()} class="text-indigo-600 text-sm font-semibold hover:underline">
            + Add Row
          </button>
        </div>
      </section>

      <div class="flex justify-end">
        <button on:click={saveOrder} class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg">
          Save & Move to Receiving →
        </button>
      </div>
    </div>
  {/if}
</div>
