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

<div class="surface-elevated p-6 md:p-7 anim-in" style="border-radius: 18px;">
  <div class="mb-5">
    <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Welcome back</h2>
    <p class="text-[12.5px] text-[var(--text-3)] mt-1">Sign in to continue to your shop.</p>
  </div>

  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-[10px] p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{error}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="flex flex-col gap-4">
    <Input label="Email"    type="email"    bind:value={email}    placeholder="you@example.com" required autocomplete="email" />
    <Input label="Password" type="password" bind:value={password} placeholder="••••••••"         required autocomplete="current-password" />
    <div class="flex justify-end -mt-1">
      <a href="/forgot-password" class="text-[11.5px] text-[var(--primary)] hover:underline font-medium">Forgot password?</a>
    </div>
    <Button type="submit" {loading} class="w-full justify-center btn-lg">Sign in</Button>
  </form>

  <div class="flex items-center gap-3 my-5">
    <hr class="hairline flex-1" />
    <span class="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-semibold">or</span>
    <hr class="hairline flex-1" />
  </div>

  <p class="text-center text-[12.5px] text-[var(--text-3)]">
    New to Shëlf? <a href="/signup" class="text-[var(--primary)] hover:underline font-semibold">Create an account →</a>
  </p>
</div>