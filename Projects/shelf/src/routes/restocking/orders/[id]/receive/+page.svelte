<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fetch } from './api-client';

  let po = null;
  let poItems = [];
  let receivedDate = new Date().toISOString().split('T')[0];
  let notes = '';
  let loading = true;
  let saving = false;

  async function loadPO() {
    try {
      const poId = $page.params.id;
      const [poRes, itemsRes] = await Promise.all([
        fetch(`/api/purchase-orders/${poId}`),
        fetch(`/api/purchase-order-items?purchase_order=${poId}`)
      ]);
      po = await poRes.json();
      poItems = await itemsRes.json();
    } catch (e) {
      console.error('Error loading PO:', e);
    } finally {
      loading = false;
    }
  }

  async function confirmReceipt() {
    saving = true;
    try {
      const res = await fetch(`/api/purchase-orders/${$page.params.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          received_date: receivedDate,
          notes: notes,
          items: poItems.map(item => ({
            id: item.id,
            quantity_received: item.quantity_received,
            unit_cost: item.unit_cost,
            update_cost_price: true,
            expiry_date: item.expiry_date,
            batch_number: item.batch_number
          }))
        })
      });

      if (res.ok) {
        alert('Order received successfully!');
        goto('/restocking');
      } else {
        alert('Error receiving order.');
      }
    } catch (e) {
      console.error('Receipt failed:', e);
    } finally {
      saving = false;
    }
  }

  onMount(loadPO);
</script>

<div class="p-6 max-w-4xl mx-auto">
  <header class="flex justify-between items-center mb-8">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Receive Delivery</h1>
      <p class="text-slate-500">{po?.order_ref} · {po?.supplier?.name}</p>
    </div>
    <button on:click={() => goto('/restocking')} class="text-slate-500 hover:text-slate-700">Back</button>
  </header>

  {#if loading}
    <div class="text-center p-12 text-slate-400">Loading PO...</div>
  {:else}
    <div class="space-y-8">
      <section class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Received Date</label>
          <input type="date" bind:value={receivedDate} class="w-full border border-slate-300 rounded-lg p-2" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Delivery Notes</label>
          <input type="text" bind:value={notes} placeholder="e.g. Missing 2 units" class="w-full border border-slate-300 rounded-lg p-2" />
        </div>
      </section>

      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase">Product</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-32">Ordered</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-32">Received</th>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase w-40">Expiry/Batch</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            {#each poItems as item}
              <tr>
                <td class="p-4">
                  <p class="font-medium text-slate-900">{item.product_name}</p>
                  <p class="text-xs text-slate-500">{item.product_sku}</p>
                </td>
                <td class="p-4 text-slate-600">{item.quantity_ordered}</td>
                <td class="p-4">
                  <input type="number" bind:value={item.quantity_received} class="w-full border border-slate-300 rounded-lg p-2" />
                </td>
                <td class="p-4">
                  <div class="flex gap-2">
                    <input type="date" bind:value={item.expiry_date} class="w-full border border-slate-300 rounded-lg p-2 text-xs" />
                    <input type="text" bind:value={item.batch_number} placeholder="Batch" class="w-24 border border-slate-300 rounded-lg p-2 text-xs" />
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      <div class="flex justify-end">
        <button on:click={confirmReceipt} disabled={saving} class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg disabled:opacity-50">
          {saving ? 'Processing...' : 'Confirm Delivery Receipt'}
        </button>
      </div>
    </div>
  {/if}
</div>
