<script lang="ts">
  import { auth }        from '$lib/stores/auth.svelte';
  import { currentShop } from '$lib/stores/shop.svelte';
  import { theme }       from '$lib/stores/theme.svelte';
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
  });
</script>

<svelte:head><title>Shëlf</title></svelte:head>
<Sidebar />
<BottomNav />
<TopProgress />
<div class="app-main min-h-screen flex flex-col">
  <Header onOpenCommandBar={() => (cmdOpen = true)} />
  <main class="page-shell flex-1">
    {@render children()}
  </main>
</div>
<Toast />
<OfflineIndicator />
<CommandBar bind:open={cmdOpen} {products} />
