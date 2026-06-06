<script lang="ts">
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { page } from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';

  let order = null;
  let items = [];
  let loading = true;
  let saving = false;

  let received_date = new Date().toISOString().split('T')[0];
  let notes = '';

  onMount(async () => {
    try {
      const res = await api('GET', `/api/purchase-orders/${$page.params.id}`);
      order = res;
      items = res.items.map(item => ({
        ...item,
        quantity_received: item.quantity_ordered,
        unit_cost: item.unit_cost,
        update_cost_price: true,
        expiry_date: '',
        batch_number: '',
      }));
    } catch (e) {
      toasts.error('Failed to load purchase order');
    } finally {
      loading = false;
    }
  });

  async function handleReceive() {
    saving = true;
    try {
      const payload = {
        received_date,
        notes,
        items: items.map(i => ({
          id: i.id,
          quantity_received: i.quantity_received,
          unit_cost: i.unit_cost,
          update_cost_price: i.update_cost_price,
          expiry_date: i.expiry_date,
          batch_number: i.batch_number,
        })),
      };

      await api('POST', `/api/purchase-orders/${$page.params.id}/receive`, payload);
      toasts.success('Order received successfully');
      window.location.href = `/restocking/orders/${$page.params.id}`;
    } catch (e) {
      toasts.error('Failed to record receipt');
    } finally {
      saving = false;
    }
  }

  function updateItem(index: number, field: string, value: any) {
    items[index][field] = value;
    items = [...items];
  }
</script>

<PageShell title="Receive Delivery">
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Receive Delivery</p>
      <p class="text-xs text-[var(--text-3)]">Verify and record delivered stock</p>
    </div>
    <Button variant="ghost" href="/restocking/orders/{$page.params.id}" size="sm">Cancel</Button>
  </div>

  <div class="max-w-4xl mx-auto p-4 space-y-6">
    
    <!-- PO Info Summary -->
    {#if order}
      <div class="card p-6 flex justify-between items-center">
        <div>
          <div class="text-xs text-muted-foreground uppercase font-bold">{order.order_ref}</div>
          <div class="text-xl font-bold">{order.supplier?.name || 'Unknown Supplier'}</div>
          <div class="text-xs text-[var(--text-3)]">Ordered on {order.order_date}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-muted-foreground">Total Value</div>
          <div class="text-lg font-bold">{formatCurrency(order.total_cost)}</div>
        </div>
      </div>
    {/if}

    <!-- Receipt Details -->
    <div class="card p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <Input label="Received Date" type="date" bind:value={received_date} />
      <Input label="Receipt Notes" placeholder="e.g. Missing 2 units, damaged box..." bind:value={notes} />
    </div>

    <!-- Items Receiving Table -->
    <div class="card overflow-hidden">
      <div class="p-4 border-b border-[var(--border)] bg-muted/30">
        <h3 class="font-semibold text-sm">Items to Receive</h3>
        <p class="text-xs text-[var(--text-3)]">Adjust quantities to match actual delivery</p>
      </div>

      <table class="tbl">
        <thead>
          <tr>
            <th>Product</th>
            <th class="w-24 text-center">Ordered</th>
            <th class="w-32 text-center">Received</th>
            <th class="w-32 text-center">Unit Cost</th>
            <th class="w-32 text-center">Update Cost?</th>
            <th class="w-40">Expiry/Batch</th>
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
              <td class="text-center text-xs font-medium">
                {item.quantity_ordered}
              </td>
              <td class="text-center">
                <Input type="number" class="h-8 w-16 mx-auto text-center" bind:value={item.quantity_received} on:input={() => updateItem(i, 'quantity_received', item.quantity_received)} />
              </td>
              <td class="text-center">
                <Input type="number" class="h-8 w-24 mx-auto text-center" bind:value={item.unit_cost} on:input={() => updateItem(i, 'unit_cost', item.unit_cost)} />
              </td>
              <td class="text-center">
                <Toggle bind:checked={item.update_cost_price} on:change={() => updateItem(i, 'update_cost_price', item.update_cost_price)} />
              </td>
              <td class="flex gap-2">
                <Input type="date" class="h-7 text-xs flex-1" bind:value={item.expiry_date} on:input={() => updateItem(i, 'expiry_date', item.expiry_date)} />
                <Input placeholder="Batch" class="h-7 text-xs flex-1" bind:value={item.batch_number} on:input={() => updateItem(i, 'batch_number', item.batch_number)} />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Action Footer -->
    <div class="flex justify-end">
      <Button variant="primary" onclick={handleReceive} disabled={saving} class="px-8">
        {#if saving}
          <span class="flex items-center gap-2">
            <span class="animate-spin">🌀</span> Processing...
          </span>
        {:else}
          Confirm Receipt & Update Stock
        {/if}
      </Button>
    </div>
  </div>
</PageShell>
