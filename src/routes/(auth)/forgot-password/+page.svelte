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

<div class="surface-elevated p-6 md:p-7 anim-in" style="border-radius: 18px;">
  {#if sent}
    <div class="text-center py-3">
      <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
           style="background: color-mix(in srgb, var(--teal) 14%, transparent);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal-fg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>
      <h2 class="text-[16px] font-semibold text-[var(--text)] tracking-tight">Check your email</h2>
      <p class="text-[12.5px] text-[var(--text-3)] mt-1.5 leading-relaxed">
        We sent a reset link to <strong class="text-[var(--text-2)] font-semibold">{email}</strong>
      </p>
    </div>
  {:else}
    <div class="mb-5">
      <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Reset your password</h2>
      <p class="text-[12.5px] text-[var(--text-3)] mt-1">We'll send a reset link to your email.</p>
    </div>
    {#if error}
      <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-[10px] p-3 mb-4 flex items-start gap-2"
           role="alert">
        <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
        <span>{error}</span>
      </div>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="flex flex-col gap-4">
      <Input label="Email" type="email" bind:value={email} required autocomplete="email" />
      <Button type="submit" {loading} class="w-full justify-center btn-lg">Send reset link</Button>
    </form>
  {/if}
  <p class="text-center text-[12.5px] text-[var(--text-3)] mt-5">
    <a href="/login" class="text-[var(--primary)] hover:underline font-semibold">← Back to sign in</a>
  </p>
</div>