<script lang="ts">
  import { onMount } from 'svelte';
  import { fetch } from './api-client';

  let data = { products: [], suppliers: [], matrix: {} };
  let loading = true;

  async function loadComparison() {
    try {
      const res = await fetch('/api/price-comparison');
      data = await res.json();
    } catch (e) {
      console.error('Comparison load failed:', e);
    } finally {
      loading = false;
    }
  }

  onMount(loadComparison);
</script>

<div class="p-6 max-w-6xl mx-auto">
  <header class="mb-8">
    <h1 class="text-2xl font-bold text-slate-900">Price Comparison</h1>
    <p class="text-slate-500">Comparing latest unit costs across all suppliers</p>
  </header>

  {#if loading}
    <div class="text-center p-12 text-slate-400">Loading matrix...</div>
  {:else}
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="p-4 text-xs font-bold text-slate-500 uppercase">Product</th>
              {#each data.suppliers as s}
                <th class="p-4 text-xs font-bold text-slate-500 uppercase">{s.name}</th>
              {/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            {#each data.products as p}
              <tr>
                <td class="p-4">
                  <p class="font-medium text-slate-900">{p.name}</p>
                  <p class="text-xs text-slate-500">{p.sku}</p>
                </td>
                {#each data.suppliers as s}
                  <td class="p-4">
                    {#if data.matrix[p.id]?.[s.id]}
                      <div class="flex items-center gap-2">
                        <span class="font-medium {data.matrix[p.id][s.id].is_cheapest ? 'text-green-600' : 'text-slate-600'}">
                          ₦{(data.matrix[p.id][s.id].unit_cost / 100).toLocaleString()}
                        </span>
                        {#if data.matrix[p.id][s.id].is_cheapest}
                          <span class="text-green-500 text-xs">★</span>
                        {/if}
                      </div>
                    {:else}
                      <span class="text-slate-300">—</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
