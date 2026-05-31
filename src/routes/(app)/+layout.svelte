<script lang="ts">
  import { auth }        from '$lib/stores/auth.svelte';
  import { currentShop } from '$lib/stores/shop.svelte';
  import { theme }       from '$lib/stores/theme.svelte';
  import Sidebar   from '$lib/components/layout/Sidebar.svelte';
  import BottomNav from '$lib/components/layout/BottomNav.svelte';
  import Header    from '$lib/components/layout/Header.svelte';
  import Toast     from '$lib/components/ui/Toast.svelte';

  let { data, children } = $props();

  $effect.pre(() => {
    auth.init(data.user as any, data.shopMember as any);
    currentShop.init(data.currentShop as any);

    if (data.currentShop) {
      theme.init((data.currentShop as any).theme ?? 'system');
      theme.applyShopPalette(
        (data.currentShop as any).primary_color ?? '#7B4F8A',
        (data.currentShop as any).sidebar_bg    ?? '#150F1C',
      );
    }
  });
</script>

<svelte:head><title>Shëlf</title></svelte:head>
<Sidebar />
<BottomNav />
<div class="app-main min-h-screen">
  <Header />
  {@render children()}
</div>
<Toast />
