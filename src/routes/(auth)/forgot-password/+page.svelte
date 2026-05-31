<script lang="ts">
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let email   = $state('');
  let sent    = $state(false);
  let loading = $state(false);
  let error   = $state('');

  async function submit() {
    loading = true; error = '';
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) sent = true;
      else { const d = await res.json(); error = d.error ?? 'Something went wrong'; }
    } catch { error = 'Network error'; }
    loading = false;
  }
</script>

<svelte:head><title>Forgot Password · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  {#if sent}
    <div class="text-center py-4">
      <div class="w-12 h-12 rounded-full bg-[var(--teal-dim)] flex items-center justify-center mx-auto mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>
      <p class="font-semibold text-sm mb-1">Check your email</p>
      <p class="text-xs text-[var(--text-3)]">We sent a reset link to <strong>{email}</strong></p>
    </div>
  {:else}
    <h2 class="font-semibold text-sm mb-1">Reset your password</h2>
    <p class="text-xs text-[var(--text-3)] mb-5">We'll send a reset link to your email.</p>
    {#if error}
      <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-xs rounded-lg p-3 mb-4">{error}</div>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="flex flex-col gap-4">
      <Input label="Email" type="email" bind:value={email} required />
      <Button type="submit" {loading} class="w-full justify-center">Send reset link</Button>
    </form>
  {/if}
  <p class="text-center text-xs text-[var(--text-3)] mt-4">
    <a href="/login" class="text-[var(--primary)] hover:underline">← Back to sign in</a>
  </p>
</div>
