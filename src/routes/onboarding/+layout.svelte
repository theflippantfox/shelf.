<script lang="ts">
  import { page } from '$app/stores';
  import '../../app.css';

  // Onboarding now starts at /shop (account creation is at /signup)
  const STEPS = ['shop', 'locale', 'appearance', 'team', 'categories', 'complete'];
  let { children } = $props();

  const currentSlug = $derived($page.url.pathname.split('/').pop() ?? '');
  const currentStep = $derived(STEPS.indexOf(currentSlug));
  const progress    = $derived(currentStep >= 0 ? ((currentStep + 1) / STEPS.length) * 100 : 0);
</script>

<div class="onboarding-progress-bar">
  <div class="onboarding-progress-fill" style="width:{progress}%"></div>
</div>

<div class="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-6">
      <a href="/welcome" class="font-serif text-2xl" style="color:var(--primary)">Shëlf.</a>
      {#if currentStep >= 0}
        <p class="text-xs text-[var(--text-3)] mt-0.5">Shop setup · Step {currentStep + 1} of {STEPS.length}</p>
      {/if}
    </div>
    {@render children()}
  </div>
</div>
