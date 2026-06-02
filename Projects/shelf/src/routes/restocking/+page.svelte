<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fetch } from './api-client'; // Assume a helper or just use native fetch

  let suggestions = [];
  let pendingOrders = [];
  let loading = true;

  async function loadDashboard() {
    try {
      const [sugRes, pendRes] = await Promise.all([
        fetch('/api/restocking/suggestions'),
        fetch('/api/purchase-orders?status=draft,ordered')
      ]);
      suggestions = await sugRes.json();
      pendingOrders = await pendRes.json();
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      loading = false;
    }
  }

  onMount(loadDashboard);
</script>

<div class="p-6 max-w-6xl mx-auto">
  <header class="flex justify-between items-center mb-8">
    <div>
      <h1 class="text-3xl font-bold text-slate-900">Restocking</h1>
      <p class="text-slate-500">Manage suppliers, orders, and stock arrivals</p>
    </div>
    <a href="/restocking/orders/new" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
      + New Order
    </a>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Suggestions Column -->
    <div class="lg:col-span-2 space-y-6">
      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 class="font-semibold text-slate-700">🔔 Reorder Suggestions</h2>
          <span class="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-bold">
            {suggestions.length} Items
          </span>
        </div>
        
        {#if loading}
          <div class="p-8 text-center text-slate-400">Loading suggestions...</div>
        {:else if suggestions.length === 0}
          <div class="p-8 text-center text-slate-400">All stock levels healthy. No reorders suggested.</div>
        {:else}
          <div class="divide-y divide-slate-200">
            {#each suggestions as item}
              <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <p class="font-medium text-slate-900">{item.name}</p>
                  <p class="text-xs text-slate-500">
                    Stock: <span class="font-bold">{item.qty}</span> · 
                    Reorder Point: <span class="font-bold">{item.reorder_point}</span> · 
                    Preferred: {item.preferred_supplier?.name || 'None'}
                  </p>
                </div>
                <a href="/restocking/orders/new?product={item.id}" class="text-indigo-600 text-sm font-semibold hover:underline">
                  Order Now →
                </a>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <!-- Pending Orders Column -->
    <div class="space-y-6">
      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="p-4 border-b border-slate-200 bg-slate-50">
          <h2 class="font-semibold text-slate-700">📦 Pending Deliveries</h2>
        </div>
        
        {#if loading}
          <div class="p-8 text-center text-slate-400">Loading orders...</div>
        {:else if pendingOrders.length === 0}
          <div class="p-8 text-center text-slate-400">No pending orders.</div>
        {:else}
          <div class="divide-y divide-slate-200">
            {#each pendingOrders as po}
              <div class="p-4 hover:bg-slate-50 transition-colors">
                <div class="flex justify-between items-start mb-2">
                  <p class="font-medium text-slate-900">{po.order_ref}</p>
                  <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {po.status}
                  </span>
                </div>
                <p class="text-xs text-slate-500 mb-3">{po.supplier?.name}</p>
                <a href="/restocking/orders/{po.id}/receive" class="block text-center bg-slate-900 text-white text-xs py-2 rounded font-medium hover:bg-slate-800 transition-colors">
                  Receive Items
                </a>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>
