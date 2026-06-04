<script lang="ts">
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { page } from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';

  let order = null;
  let loading = true;

  onMount(async () => {
    try {
      order = await api('GET', `/api/purchase-orders/${$page.params.id}`);
    } catch (e) {
      toasts.error('Failed to load purchase order');
    } finally {
      loading = false;
    }
  });
</script>

<PageShell title="Purchase Order Detail">
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Purchase Order</p>
      <p class="text-xs text-[var(--text-3]">{order?.order_ref || 'Loading...'}</p>
    </div>
    <Button variant="ghost" href="/restocking" size="sm">Back to Dashboard</Button>
  </div>

  <div class="max-w-4xl mx-auto p-4 space-y-6">
    {#if loading}
      <div class="flex justify-center p-12">
        <span class="animate-spin">🌀</span>
      </div>
    {:else if order}
      <div class="card p-6 space-y-6">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-3xl font-bold">{order.supplier?.name || 'Unknown Supplier'}</div>
            <div class="text-sm text-muted-foreground">Placed on {order.order_date}</div>
          </div>
          <div class="text-right">
            <div class="px-3 py-1 rounded-full text-xs font-bold uppercase {
              order.status === 'received' ? 'bg-green-500/20 text-green-500' : 
              order.status === 'partial' ? 'bg-yellow-500/20 text-yellow-500' : 
              'bg-blue-500/20 text-blue-500'
            }">
              {order.status}
            </div>
            <div class="text-2xl font-bold mt-2">{formatCurrency(order.total_cost)}</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-muted-foreground text-xs uppercase font-bold">Expected Delivery</div>
            <div>{order.expected_delivery_date || 'Not specified'}</div>
          </div>
          <div>
            <div class="text-muted-foreground text-xs uppercase font-bold">Received Date</div>
            <div>{order.received_date || 'Not yet received'}</div>
          </div>
        </div>

        <div class="border-t border-[var(--border)] pt-6">
          <h3 class="font-semibold mb-4 text-sm">Items</h3>
          <table class="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th class="text-center">Ordered</th>
                <th class="text-center">Received</th>
                <th class="text-right">Unit Cost</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each order.items as item}
                <tr>
                  <td>
                    <div class="flex flex-col">
                      <span class="text-xs font-semibold">{item.product_name}</span>
                      <span class="text-[10px] text-[var(--text-3)]">{item.product_sku}</span>
                    </div>
                  </td>
                  <td class="text-center text-xs">{item.quantity_ordered}</td>
                  <td class="text-center text-xs">{item.quantity_received}</td>
                  <td class="text-right text-xs">{formatCurrency(item.unit_cost)}</td>
                  <td class="text-right font-medium text-xs">{formatCurrency(item.line_total)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if order.notes}
          <div class="bg-muted/50 p-4 rounded-lg text-xs italic text-muted-foreground">
            "{order.notes}"
          </div>
        {/if}

        <div class="flex justify-end gap-3 pt-6">
          {#if order.status !== 'received'}
            <Button variant="primary" href="/restocking/orders/{order.id}/receive">
              Receive Delivery
            </Button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="text-center p-12">
        <p class="text-muted-foreground">Order not found</p>
        <Button variant="ghost" href="/restocking" class="mt-4">Return to Dashboard</Button>
      </div>
    {/if}
  </div>
</PageShell>
