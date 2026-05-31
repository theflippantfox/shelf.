<script lang="ts">
  import { goto } from '$app/navigation';
  import { page }  from '$app/stores';
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let email    = $state('');
  let password = $state('');
  let error    = $state('');
  let loading  = $state(false);

  async function handleLogin() {
    error = ''; loading = true;
    try {
      const res  = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Login failed'; return; }
      goto($page.url.searchParams.get('next') ?? '/');
    } catch { error = 'Network error — please try again'; }
    finally { loading = false; }
  }
</script>

<svelte:head><title>Sign in · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold text-sm mb-5">Sign in to your account</h2>
  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-xs rounded-lg p-3 mb-4">{error}</div>
  {/if}
  <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="flex flex-col gap-4">
    <Input label="Email"    type="email"    bind:value={email}    placeholder="you@example.com" required />
    <Input label="Password" type="password" bind:value={password} placeholder="••••••••"         required />
    <div class="flex justify-end">
      <a href="/forgot-password" class="text-xs text-[var(--primary)] hover:underline">Forgot password?</a>
    </div>
    <Button type="submit" {loading} class="w-full justify-center">Sign in</Button>
  </form>
  <p class="text-center text-xs text-[var(--text-3)] mt-5">
    New shop? <a href="/signup" class="text-[var(--primary)] hover:underline">Create account →</a>
  </p>
</div>
