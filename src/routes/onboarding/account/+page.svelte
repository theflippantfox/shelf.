<script lang="ts">
  import { goto } from '$app/navigation';
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let first_name = $state('');
  let last_name  = $state('');
  let email      = $state('');
  let password   = $state('');
  let confirm    = $state('');
  let error      = $state('');
  let loading    = $state(false);

  async function next() {
    if (password !== confirm) { error = 'Passwords do not match'; return; }
    if (password.length < 8)  { error = 'Password must be at least 8 characters'; return; }
    error = ''; loading = true;
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name, last_name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Registration failed'; return; }
      goto('/onboarding/shop');
    } catch { error = 'Network error'; }
    finally { loading = false; }
  }
</script>

<svelte:head><title>Create your account · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Create your account</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">You'll be the owner of your shop.</p>
  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-xs rounded-lg p-3 mb-4">{error}</div>
  {/if}
  <form onsubmit={(e) => { e.preventDefault(); next(); }} class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <Input label="First name" bind:value={first_name} required />
      <Input label="Last name"  bind:value={last_name} />
    </div>
    <Input label="Email"           type="email"    bind:value={email}    required />
    <Input label="Password"        type="password" bind:value={password} required />
    <Input label="Confirm password" type="password" bind:value={confirm} required />
    <Button type="submit" {loading} class="w-full justify-center">Continue →</Button>
  </form>
  <p class="text-center text-xs text-[var(--text-3)] mt-4">
    Already have an account? <a href="/login" class="text-[var(--primary)] hover:underline">Sign in</a>
  </p>
</div>
