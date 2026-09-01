<script lang="ts">
  import { formatCurrency } from '$lib/utils/format';
  import { auth } from '$lib/stores/auth.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { PackagePlus, Users, BarChart3 } from 'lucide-svelte';

  let { data } = $props();
</script>

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">Restocking Hub</h1>
  </div>
  {#if auth.can('inventory.manage')}
    <div class="flex gap-2">
      <Button onclick={() => window.location.href = '/restocking/suppliers'} variant="secondary" size="sm">
        <Users size={14} strokeWidth={2} /> Suppliers
      </Button>
      <Button onclick={() => window.location.href = '/restocking/orders/new'} size="sm">
        <PackagePlus size={14} strokeWidth={2} /> New Order
      </Button>
    </div>
  {/if}
</header>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
    <div class="surface-card p-5 md:p-6 flex flex-col items-center text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <PackagePlus size={24} />
      </div>
      <div>
        <p class="font-semibold">Purchase Orders</p>
        <p class="text-xs text-text-3 mb-4">Track and receive stock</p>
      </div>
      <Button onclick={() => window.location.href = '/restocking/orders/new'} class="w-full">Create PO</Button>
    </div>

    <div class="surface-card p-5 md:p-6 flex flex-col items-center text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Users size={24} />
      </div>
      <div>
        <p class="font-semibold">Suppliers</p>
        <p class="text-xs text-text-3 mb-4">Manage vendor relationships</p>
      </div>
      <Button onclick={() => window.location.href = '/restocking/suppliers'} variant="secondary" class="w-full">View Suppliers</Button>
    </div>

    <div class="surface-card p-5 md:p-6 flex flex-col items-center text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <BarChart3 size={24} />
      </div>
      <div>
        <p class="font-semibold">Price Intelligence</p>
        <p class="text-xs text-text-3 mb-4">Compare supplier pricing</p>
      </div>
      <Button onclick={() => window.location.href = '/restocking/price-comparison'} variant="secondary" class="w-full">Price Matrix</Button>
    </div>
  </div>
