<script lang="ts">
  import { goto } from '$app/navigation';
  import Input         from '$lib/components/ui/Input.svelte';
  import PasswordInput from '$lib/components/ui/PasswordInput.svelte';
  import Button        from '$lib/components/ui/Button.svelte';
  import { registerApiSchema, type FieldErrors } from '$lib/validators';
  import { registerSchema } from '$lib/validators';

  let first_name = $state('');
  let last_name  = $state('');
  let email      = $state('');
  let password   = $state('');
  let confirm    = $state('');

  // Show field-level errors (e.g. 'Passwords do not match') from the form-level
  // refinement. Submitted with the same `registerApiSchema` plus the form-only
  // confirm check, so we can show that error inline before hitting the API.
  let fieldErrors: FieldErrors<{ first_name: string; last_name: string; email: string; password: string; confirm: string }> = $state({});
  let formError = $state('');
  let loading   = $state(false);

  function clearField(field: keyof typeof fieldErrors) {
    if (fieldErrors[field]) fieldErrors = { ...fieldErrors, [field]: undefined };
  }

  // Live password strength (cheap heuristic, displayed as a small bar)
  const strength = $derived((() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })());
  const strengthLabel = $derived(
    strength <= 1 ? { txt: 'Weak',   color: 'var(--crimson)' } :
    strength <= 3 ? { txt: 'Okay',   color: 'var(--amber)'   } :
                    { txt: 'Strong', color: 'var(--teal)'    }
  );

  async function register() {
    formError = '';
    fieldErrors = {};
    // Form-level validation (includes the password match refinement)
    const parsed = registerSchema.safeParse({ first_name, last_name, email, password, confirm });
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
      // Send the API-shaped payload (no confirm) — the form already verified the match
      const res  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerApiSchema.parse(parsed.data)),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server may return field-level errors too — show them inline
        if (data.fieldErrors) {
          fieldErrors = data.fieldErrors;
        }
        formError = data.error ?? 'Registration failed';
        return;
      }
      goto('/welcome');
    } catch {
      formError = 'Network error — please try again';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Create account · Shëlf</title></svelte:head>

<div class="surface-elevated p-6 md:p-7 anim-in" style="border-radius: 18px;">
  <div class="mb-5">
    <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Create your account</h2>
    <p class="text-[12.5px] text-[var(--text-3)] mt-1">Free to sign up. Start a shop or join one later.</p>
  </div>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-[10px] p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); register(); }} class="flex flex-col gap-4" novalidate>
    <div class="grid grid-cols-2 gap-3">
      <Input label="First name" bind:value={first_name} required autocomplete="given-name"
             oninput={() => clearField('first_name')}
             error={fieldErrors.first_name} />
      <Input label="Last name"  bind:value={last_name}  autocomplete="family-name"
             oninput={() => clearField('last_name')}
             error={fieldErrors.last_name} />
    </div>
    <Input label="Email" type="email" bind:value={email} required placeholder="you@example.com"
           autocomplete="email"
           oninput={() => clearField('email')}
           error={fieldErrors.email} />

    <div>
      <PasswordInput
        label="Password"
        bind:value={password}
        placeholder="At least 8 characters"
        autocomplete="new-password"
        required
        oninput={() => clearField('password')}
        error={fieldErrors.password}
      />
      {#if password && !fieldErrors.password}
        <div class="mt-1.5 flex items-center gap-2">
          <div class="flex-1 h-1 rounded-full overflow-hidden" style="background:var(--surface2)">
            <div
              class="h-full transition-all duration-300"
              style="width:{Math.min(strength * 25, 100)}%; background:{strengthLabel.color}"
            ></div>
          </div>
          <span class="text-[10px] font-semibold" style="color:{strengthLabel.color}">{strengthLabel.txt}</span>
        </div>
      {/if}
    </div>

    <PasswordInput
      label="Confirm password"
      bind:value={confirm}
      placeholder="Repeat password"
      autocomplete="new-password"
      required
      oninput={() => clearField('confirm')}
      error={fieldErrors.confirm}
    />

    <Button type="submit" {loading} class="w-full justify-center btn-lg">Create account</Button>
  </form>

  <p class="text-center text-[12.5px] text-[var(--text-3)] mt-5">
    Already have an account?
    <a href="/login" class="text-[var(--primary)] hover:underline font-semibold">Sign in</a>
  </p>
</div>
