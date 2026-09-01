<script lang="ts">
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { forgotPasswordSchema, type FieldErrors } from '$lib/validators';

  let email   = $state('');
  let fieldErrors: FieldErrors<{ email: string }> = $state({});
  let sent    = $state(false);
  let loading = $state(false);

  async function submit() {
    fieldErrors = {};
    const parsed = forgotPasswordSchema.safeParse({ email });
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
      // Always returns 200 (server doesn't leak account existence)
      await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      sent = true;
    } catch {
      // Even on error, show the sent state — don't leak which side failed
      sent = true;
    }
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
      <p class="text-[11px] text-[var(--text-3)] mt-3">
        Didn't get it? Check spam, or <button class="text-[var(--primary)] hover:underline font-semibold" onclick={() => sent = false}>try again</button>.
      </p>
    </div>
  {:else}
    <div class="mb-5">
      <h2 class="text-[18px] font-semibold text-[var(--text)] tracking-tight">Reset your password</h2>
      <p class="text-[12.5px] text-[var(--text-3)] mt-1">We'll send a reset link to your email.</p>
    </div>
    <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="flex flex-col gap-4" novalidate>
      <Input label="Email" type="email" bind:value={email} required autocomplete="email"
             error={fieldErrors.email} />
      <Button type="submit" {loading} class="w-full justify-center btn-lg">Send reset link</Button>
    </form>
  {/if}
  <p class="text-center text-[12.5px] text-[var(--text-3)] mt-5">
    <a href="/login" class="text-[var(--primary)] hover:underline font-semibold">← Back to sign in</a>
  </p>
</div>
