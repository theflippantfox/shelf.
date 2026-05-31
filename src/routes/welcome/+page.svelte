<script lang="ts">
  import { Store, UserCheck, ArrowRight } from 'lucide-svelte';
  import '../../app.css';

  let { data } = $props();
  const firstName = $derived((data.user as any)?.first_name ?? 'there');
</script>

<svelte:head><title>Welcome · Shëlf</title></svelte:head>

<div class="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-5">
  <div class="w-full max-w-md fade-up">

    <!-- Brand -->
    <div class="text-center mb-8">
      <span class="font-serif text-3xl" style="color:var(--primary)">Shëlf.</span>
    </div>

    <!-- Greeting -->
    <div class="mb-6 text-center">
      <h1 class="text-xl font-semibold mb-1">Welcome, {firstName}! 👋</h1>
      <p class="text-sm text-[var(--text-3)]">Your account is ready. What would you like to do?</p>
    </div>

    <!-- Options -->
    <div class="flex flex-col gap-3">

      <!-- Create a shop -->
      <a
        href="/onboarding/shop"
        class="card p-5 flex items-start gap-4 hover:border-[var(--primary)] transition-colors group cursor-pointer"
        style="border-width:1.5px"
      >
        <div class="w-10 h-10 rounded-xl bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--primary)] transition-colors">
          <Store size={18} style="color:var(--primary)" class="group-hover:text-white transition-colors" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">Create my shop</p>
          <p class="text-xs text-[var(--text-3)] mt-0.5">
            Set up your own POS — add products, manage inventory, and track sales.
          </p>
        </div>
        <ArrowRight size={16} class="text-[var(--text-3)] mt-1 flex-shrink-0 group-hover:text-[var(--primary)] transition-colors" strokeWidth={1.75} />
      </a>

      <!-- Join a shop -->
      <div class="card p-5 flex items-start gap-4" style="border-width:1.5px">
        <div class="w-10 h-10 rounded-xl bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
          <UserCheck size={18} class="text-[var(--text-3)]" strokeWidth={1.75} />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">Join a shop</p>
          <p class="text-xs text-[var(--text-3)] mt-0.5">
            If a shop owner has added you as staff, you'll have access once they send you a login.
            No action needed here.
          </p>
          <p class="text-[10px] text-[var(--text-3)] mt-2 bg-[var(--surface2)] rounded-lg px-2 py-1.5 font-mono break-all">
            Your email: {(data.user as any)?.email}
          </p>
        </div>
      </div>
    </div>

    <p class="text-center text-[10px] text-[var(--text-3)] mt-6">
      You can always create or join a shop later from your account.
    </p>
  </div>
</div>
