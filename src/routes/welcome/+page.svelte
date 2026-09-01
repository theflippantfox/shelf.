<script lang="ts">
  import { Store, UserCheck, ArrowRight } from 'lucide-svelte';
  import '../../app.css';

  let { data } = $props();
  const firstName = $derived((data.user as any)?.first_name ?? 'there');
</script>

<svelte:head><title>Welcome · Shëlf</title></svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center relative overflow-hidden p-5">
  <!-- Brand ambient background, matches the auth layout -->
  <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
    <div class="auth-glow absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full"
         style="background: radial-gradient(circle, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 60%); filter: blur(20px);"></div>
    <div class="auth-glow absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full"
         style="background: radial-gradient(circle, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 60%); filter: blur(20px);"></div>
  </div>

  <div class="relative w-full max-w-md anim-in">
    <!-- Brand mark — matches the sidebar's exact structure -->
    <div class="sidebar-brand" style="border-bottom: none; padding: 0 0 32px; justify-content: center; gap: 10px;">
      <span class="sidebar-brand-mark">S</span>
      <span class="sidebar-brand-text" style="color: var(--text);">Shëlf<span class="sidebar-brand-dot">.</span></span>
    </div>

    <div class="mb-6 text-center">
      <h1 class="text-[22px] font-semibold text-[var(--text)] tracking-tight">Welcome, {firstName} <span aria-hidden="true">👋</span></h1>
      <p class="text-[13px] text-[var(--text-3)] mt-1.5">Your account is ready. What would you like to do?</p>
    </div>

    <div class="flex flex-col gap-3 anim-stagger">
      <!-- Create a shop -->
      <a href="/onboarding/shop" class="surface-card interactive p-5 flex items-start gap-4 group no-glow">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
             style="background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary);">
          <Store size={20} strokeWidth={1.75} />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-[14px] text-[var(--text)]">Create my shop</p>
          <p class="text-[12.5px] text-[var(--text-3)] mt-0.5 leading-relaxed">
            Set up your own POS — add products, manage inventory, and track sales.
          </p>
        </div>
        <ArrowRight size={16} class="text-[var(--text-3)] mt-1 flex-shrink-0 group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all" strokeWidth={1.75} />
      </a>

      <!-- Join a shop -->
      <div class="surface-card p-5 flex items-start gap-4 no-glow">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
             style="background: var(--surface2); color: var(--text-3);">
          <UserCheck size={20} strokeWidth={1.75} />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-[14px] text-[var(--text)]">Join a shop</p>
          <p class="text-[12.5px] text-[var(--text-3)] mt-0.5 leading-relaxed">
            If a shop owner has added you as staff, you'll have access once they send you a login. No action needed here.
          </p>
          {#if (data.user as any)?.email}
            <p class="text-[11px] text-[var(--text-2)] mt-2.5 surface-inset px-2.5 py-1.5 font-mono break-all">
              {(data.user as any)?.email}
            </p>
          {/if}
        </div>
      </div>
    </div>

    <p class="text-center text-[11px] text-[var(--text-3)] mt-6">
      You can always create or join a shop later from your account.
    </p>
  </div>
</div>