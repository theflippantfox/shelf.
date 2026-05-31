<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { CheckCircle2 } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';

  onMount(() => { setTimeout(() => goto('/'), 4000); });
</script>

<svelte:head><title>You're all set! · Shëlf</title></svelte:head>
<div class="card p-8 text-center fade-up">
  <div class="w-16 h-16 rounded-full bg-[var(--teal-dim)] flex items-center justify-center mx-auto mb-4">
    <CheckCircle2 size={32} style="color:var(--teal)" />
  </div>
  <h2 class="font-serif text-2xl mb-2">You're all set!</h2>
  <p class="text-sm text-[var(--text-3)] mb-6">Your shop is ready. Taking you to the dashboard…</p>
  <Button href="/" class="w-full justify-center">Go to Dashboard →</Button>
</div>
