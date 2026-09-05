<script lang="ts">
  import { auth }        from '$lib/stores/auth.svelte';
  import { currentShop } from '$lib/stores/shop.svelte';
  import { theme }       from '$lib/stores/theme.svelte';
  import { inventory as invStore } from '$lib/stores/inventory.svelte';
  import { customers as custStore } from '$lib/stores/customers.svelte';
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import Sidebar           from '$lib/components/layout/Sidebar.svelte';
  import BottomNav         from '$lib/components/layout/BottomNav.svelte';
  import Header            from '$lib/components/layout/Header.svelte';
  import Toast             from '$lib/components/ui/Toast.svelte';
  import OfflineIndicator  from '$lib/components/ui/OfflineIndicator.svelte';
  import TopProgress       from '$lib/components/ui/TopProgress.svelte';
  import CommandBar        from '$lib/components/CommandBar.svelte';
  import { onMount }       from 'svelte';

  let { data, children } = $props();

  $effect.pre(() => {
    auth.init(data.user as any, data.shopMember as any);
    currentShop.init(data.currentShop as any);

    if (data.currentShop) {
      theme.init(
        (data.currentShop as any).theme ?? 'system',
        (data.currentShop as any).palette_id ?? undefined,
      );
    }
  });

  // Hydrate the inventory + customers stores from the layout's
  // server-loaded data. We do this OUTSIDE of $effect (in the
  // script body) so it runs during SSR too — that way the
  // dashboard's "Inventory alerts" KPI and "Out of stock" / "Low
  // stock" lists are correct on the very first render, not just
  // after hydration. $effect.pre / $effect don't run on the
  // server, so the stores would otherwise be empty during SSR
  // and the alerts would briefly flash "All stocked up" before
  // the client hydrates.
  // Hydrate the inventory + customers stores from the layout's
  // server-loaded data. $effect.pre runs both on the server and
  // on the client (it runs before the page renders), so the
  // dashboard's "Inventory alerts" KPI and "Out of stock" / "Low
  // stock" lists are correct on the very first render AND they
  // stay in sync with the latest server payload on client-side
  // navigation between pages.
  $effect.pre(() => {
    if (data.allProducts) invStore.replaceAll(data.allProducts as any[]);
    if (data.customers)  custStore.replaceAll(data.customers  as any[]);
  });

  $effect(() => {
    // Warm the offline caches + drain any pending sales left in
    // IndexedDB from a previous session. Both calls are no-ops
    // when offline (they short-circuit on _online). They also
    // gracefully no-op on SSR (browser-only). We don't await —
    // the page renders first and the caches update in the
    // background.
    void offlineSync.flushPendingSales();
    void offlineSync.refreshProductsCache();
  });

  // Command-bar state — opened by Header's search button or ⌘K
  let cmdOpen   = $state(false);
  let products  = $state<any[]>([]);

  onMount(async () => {
    try {
      const res = await fetch('/api/products?limit=20');
      if (res.ok) {
        const d = await res.json();
        products = d.products ?? d ?? [];
      }
    } catch { /* offline or auth not yet ready — fine */ }

    // Populate the shop switcher. SSR has nothing here because the
    // endpoint requires the user to be signed in.
    try {
      const res = await fetch('/api/auth/my-shops');
      if (res.ok) {
        const shops = await res.json();
        currentShop.setAllShops(shops);
      }
    } catch { /* offline — header switcher will just show current */ }
  });
</script>

<svelte:head><title>Shëlf</title></svelte:head>
<Sidebar />
<TopProgress />
<div class="app-main min-h-screen flex flex-col">
  <Header onOpenCommandBar={() => (cmdOpen = true)} />
  <main class="page-shell flex-1">
    {@render children()}
  </main>
  <BottomNav />
</div>
<Toast />
<OfflineIndicator />
<CommandBar bind:open={cmdOpen} {products} />
