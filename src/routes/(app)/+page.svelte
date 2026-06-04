<script lang="ts">
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { auth } from '$lib/stores/auth.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { 
    LayoutGrid, 
    PackagePlus, 
    Users, 
    BarChart3, 
    TrendingUp,
    ShoppingBag,
    Package
  } from 'lucide-svelte';

  let { data } = $props();
</script>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Store Dashboard</p>
      <p class="text-xs text-[var(--text-3)]">Welcome back to your business overview</p>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- Quick Actions -->
    <div class="card p-4 space-y-4">
      <div class="flex items-center gap-2 mb-2">
        <LayoutGrid size={16} class="text-primary" />
        <h3 class="font-semibold text-sm">Quick Actions</h3>
      </div>
      <div class="grid grid-cols-1 gap-2">
        <Button onclick={() => window.location.href = '/sale'} class="justify-start gap-2">
          <ShoppingBag size={14} /> New Sale
        </Button>
        <Button onclick={() => window.location.href = '/inventory'} variant="secondary" class="justify-start gap-2">
          <Package size={14} /> Manage Inventory
        </Button>
        <Button onclick={() => window.location.href = '/restocking/orders/new'} variant="secondary" class="justify-start gap-2">
          <PackagePlus size={14} /> Restock Stock
        </Button>
        <Button onclick={() => window.location.href = '/restocking/suppliers'} variant="secondary" class="justify-start gap-2">
          <Users size={14} /> Manage Suppliers
        </Button>
        <Button onclick={() => window.location.href = '/analytics'} variant="secondary" class="justify-start gap-2">
          <BarChart3 size={14} /> Business Analytics
        </Button>
      </div>
    </div>

    <!-- Key Metrics (Simplified) -->
    <div class="card p-4 md:col-span-2 space-y-4">
      <div class="flex items-center gap-2 mb-2">
        <TrendingUp size={16} class="text-primary" />
        <h3 class="font-semibold text-sm">Quick Insights</h3>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="p-3 rounded-lg bg-surface-2 space-y-1">
          <p class="text-[10px] text-text-3 uppercase font-bold">Today's Sales</p>
          <p class="text-lg font-bold">{formatCurrency(0)}</p>
        </div>
        <div class="p-3 rounded-lg bg-surface-2 space-y-1">
          <p class="text-[10px] text-text-3 uppercase font-bold">Active Products</p>
          <p class="text-lg font-bold">0</p>
        </div>
        <div class="p-3 rounded-lg bg-surface-2 space-y-1">
          <p class="text-[10px] text-text-3 uppercase font-bold">Low Stock</p>
          <p class="text-lg font-bold text-crimson">0</p>
        </div>
      </div>
    </div>
  </div>
</PageShell>
