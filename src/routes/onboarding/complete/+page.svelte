<script lang="ts">
  import { CheckCircle2, ArrowRight } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { onMount } from 'svelte';

  // A short grace period before showing the "go to dashboard" CTA.
  // Removed the old 4-second auto-redirect — it was jarring and removed
  // user control over when to enter the app.
  let showCta = $state(false);
  onMount(() => { setTimeout(() => (showCta = true), 600); });
</script>

<svelte:head><title>You're all set! · Shëlf</title></svelte:head>

<div class="card p-8 text-center fade-up">
  <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
       style="background: color-mix(in srgb, var(--teal) 18%, transparent);">
    <CheckCircle2 size={32} strokeWidth={2} style="color:var(--teal)" />
  </div>
  <h2 class="font-serif text-2xl mb-2">You're all set!</h2>
  <p class="text-sm text-[var(--text-3)] mb-6">Your shop is ready. Start ringing up sales.</p>
  {#if showCta}
    <Button href="/" class="w-full justify-center group">
      Go to dashboard
      <ArrowRight size={14} strokeWidth={2} class="ml-1 transition-transform group-hover:translate-x-0.5" />
    </Button>
  {:else}
    <div class="h-9"></div>
  {/if}
</div>
