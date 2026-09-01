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
    <a href="/welcome" class="block text-center mb-6 font-serif text-2xl" style="color:var(--primary)">Shëlf.</a>

    <div class="mb-2">
      <Stepper steps={STEPS} current={currentSlug} />
    </div>

    {@render children()}
  </div>
</div>
