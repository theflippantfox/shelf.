<script lang="ts">
  import { page } from '$app/stores';
  import Stepper from '$lib/components/ui/Stepper.svelte';
  import '../../app.css';

  // Onboarding starts at /shop (account creation is at /signup)
  const STEPS = [
    { slug: 'shop',       label: 'Shop'       },
    { slug: 'locale',     label: 'Currency'   },
    { slug: 'appearance', label: 'Look'       },
    { slug: 'team',       label: 'Team'       },
    { slug: 'categories', label: 'Categories' },
    { slug: 'complete',   label: 'Done'       },
  ];

  let { children } = $props();
  const currentSlug = $derived($page.url.pathname.split('/').filter(Boolean).pop() ?? '');
</script>

<div class="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Brand mark — matches the sidebar's exact structure -->
    <div class="sidebar-brand" style="border-bottom: none; padding: 0 0 24px; justify-content: center; gap: 10px;">
      <span class="sidebar-brand-mark">S</span>
      <span class="sidebar-brand-text" style="color: var(--text);">Shëlf<span class="sidebar-brand-dot">.</span></span>
    </div>

    <div class="mb-2">
      <Stepper steps={STEPS} current={currentSlug} />
    </div>

    {@render children()}
  </div>
</div>
