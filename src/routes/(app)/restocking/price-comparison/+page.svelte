<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { formatCurrency } from '$lib/utils/format';

  let data: any = {
    products: [],
    suppliers: [],
    matrix: {},
  };
  let loading = true;

  onMount(async () => {
    try {
      data = await api('GET', '/api/price-comparison');
    } catch (e) {
      toasts.error('Failed to load price data');
    } finally {
      loading = false;
    }
  });

  function getPrice(productId: string, supplierId: string) {
    return data.matrix[productId]?.[supplierId];
  }
</script>

<PageShell title="Price Comparison">
  <header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">Price Comparison</h1>
    <p class="text-[11.5px] text-[var(--text-3)] mt-0.5">Compare latest unit costs across your suppliers</p>
  </div>
  <Button href="/restocking/orders/new" size="sm">
      <span class="flex items-center gap-1">
        <span class="text-xs">➕</span> New Order
      </span>
    </Button>
</header>

  <div class="p-4 space-y-6">
    {#if loading}
      <div class="flex justify-center p-12">
        <span class="animate-spin">🌀</span>
      </div>
    {:else}
      <div class="surface-card overflow-hidden">
        <div class="p-4 border-b border-[var(--border)] bg-muted/30 flex justify-between items-center">
          <h3 class="font-semibold text-sm">Supplier Price Matrix</h3>
          <p class="text-xs text-[var(--text-3)]">Latest observed unit costs</p>
        </div>

        <div class="overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th class="sticky left-0 bg-muted/50 z-10">Product</th>
                {#each data.suppliers as supplier}
                  <th class="text-center">{supplier.name}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each data.products as product}
                <tr>
                  <td class="sticky left-0 bg-card z-10 border-r border-[var(--border)]">
                    <div class="flex flex-col">
                      <span class="text-xs font-semibold">{product.name}</span>
                      <span class="text-[10px] text-[var(--text-3)]">{product.sku}</span>
                    </div>
                  </td>
                  {#each data.suppliers as supplier}
                    <td class="text-center">
                      {#if getPrice(product.id, supplier.id)}
                        {@const price = getPrice(product.id, supplier.id)}
                        <div class="flex flex-col items-center">
                          <span class={price.is_cheapest ? 'text-primary font-bold' : ''}>
                            {formatCurrency(price.unit_cost)}
                          </span>
                          <span class="text-[10px] text-[var(--text-3)]">
                            {new Date(price.recorded_at).toLocaleDateString()}
                          </span>
                        </div>
                      {:else}
                        <span class="text-muted-foreground/30">—</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <Button variant="secondary" href="/restocking" size="sm">
          Back to Dashboard
        </Button>
      </div>
    {/if}
  </div>
