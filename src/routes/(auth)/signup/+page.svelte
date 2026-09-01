<script lang="ts">
  import { goto } from '$app/navigation';
  import Input    from '$lib/components/ui/Input.svelte';
  import Button   from '$lib/components/ui/Button.svelte';

  let first_name = $state('');
  let last_name  = $state('');
  let email      = $state('');
  let password   = $state('');
  let confirm    = $state('');
  let error      = $state('');
  let loading    = $state(false);

  async function register() {
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
      goto('/welcome');
    } catch { error = 'Network error — please try again'; }
    finally { loading = false; }
  }
</script>

<svelte:head><title>Create account · Shëlf</title></svelte:head>

<div class="surface-elevated p-6 md:p-7 anim-in" style="border-radius: 18px;">
  <div class="mb-5">
    <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Create your account</h2>
    <p class="text-[12.5px] text-[var(--text-3)] mt-1">Free to sign up. Start a shop or join one later.</p>
  </div>

  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-[10px] p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{error}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); register(); }} class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <Input label="First name" bind:value={first_name} required autocomplete="given-name" />
      <Input label="Last name"  bind:value={last_name}  autocomplete="family-name" />
    </div>
    <Input label="Email"            type="email"    bind:value={email}    required placeholder="you@example.com" autocomplete="email" />
    <Input label="Password"         type="password" bind:value={password} required placeholder="At least 8 characters"  autocomplete="new-password" />
    <Input label="Confirm password" type="password" bind:value={confirm}  required placeholder="Repeat password"          autocomplete="new-password" />
    <Button type="submit" {loading} class="w-full justify-center btn-lg">Create account</Button>
  </form>

  <p class="text-center text-[12.5px] text-[var(--text-3)] mt-5">
    Already have an account?
    <a href="/login" class="text-[var(--primary)] hover:underline font-semibold">Sign in</a>
  </p>
</div>