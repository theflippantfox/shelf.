<script lang="ts">
  import { goto } from '$app/navigation';
  import { page }  from '$app/stores';
  import Input  from '$lib/components/ui/Input.svelte';
  import PasswordInput from '$lib/components/ui/PasswordInput.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { loginSchema, type FieldErrors } from '$lib/validators';

  let email    = $state('');
  let password = $state('');
  let fieldErrors: FieldErrors<{ email: string; password: string }> = $state({});
  let formError = $state('');
  let loading  = $state(false);

  // Clear a field's error as the user types
  function clearField(field: 'email' | 'password') {
    if (fieldErrors[field]) fieldErrors = { ...fieldErrors, [field]: undefined };
  }

  async function handleLogin() {
    formError = '';
    fieldErrors = {};
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat: any = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0]; if (typeof k === 'string' && !flat[k]) flat[k] = i.message;
      }
      fieldErrors = flat;
      return;
    }

    loading = true;
    try {
      const res  = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        // Don't leak whether it's the email or password that's wrong
        formError = 'Invalid email or password';
        return;
      }
      goto($page.url.searchParams.get('next') ?? '/');
    } catch {
      formError = 'Network error — please try again';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Sign in · Shëlf</title></svelte:head>

<div class="surface-elevated p-6 md:p-7 anim-in" style="border-radius: 18px;">
  <div class="mb-5">
    <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Welcome back</h2>
    <p class="text-[12.5px] text-[var(--text-3)] mt-1">Sign in to continue to your shop.</p>
  </div>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-[10px] p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="flex flex-col gap-4" novalidate>
    <Input
      label="Email"
      type="email"
      bind:value={email}
      oninput={() => clearField('email')}
      placeholder="you@example.com"
      autocomplete="email"
      required
      error={fieldErrors.email}
    />
    <PasswordInput
      label="Password"
      bind:value={password}
      oninput={() => clearField('password')}
      placeholder="••••••••"
      autocomplete="current-password"
      required
      error={fieldErrors.password}
    />
    <div class="flex justify-end -mt-1">
      <a href="/forgot-password" class="text-[11.5px] text-[var(--primary)] hover:underline font-medium">Forgot password?</a>
    </div>
    <Button type="submit" {loading} class="w-full justify-center btn-lg">Sign in</Button>
  </form>

  <p class="text-center text-[12.5px] text-[var(--text-3)] mt-5">
    New to Shëlf? <a href="/signup" class="text-[var(--primary)] hover:underline font-semibold">Create an account →</a>
  </p>
</div>
