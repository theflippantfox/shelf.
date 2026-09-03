<script lang="ts">
  import { goto, invalidateAll }  from '$app/navigation';
  import Button    from '$lib/components/ui/Button.svelte';
  import { Store, Inbox, ArrowRight, Check, X } from 'lucide-svelte';
  import { toasts } from '$lib/stores/toast.svelte';

  let { data } = $props();
  let busyId = $state<string | null>(null);

  const roleColor: Record<string, string> = {
    owner: 'var(--gold)', manager: 'var(--primary)', cashier: 'var(--cobalt)',
  };

  async function act(id: string, action: 'accept' | 'decline') {
    busyId = id;
    const res = await fetch('/api/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_member_id: id, action }),
    });
    if (res.ok) {
      if (action === 'accept') {
        const updated = await res.json();
        if (updated.shop?.id) {
          await fetch('/api/auth/select-shop', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: updated.shop.id }),
          });
        }
        toasts.success(`Joined ${updated.shop?.name ?? 'shop'}`);
        await invalidateAll();
        await goto('/');
      } else {
        toasts.info('Invite declined');
        await invalidateAll();
      }
    } else {
      const d = await res.json().catch(() => ({}));
      toasts.error(d.error ?? 'Failed');
    }
    busyId = null;
  }

  function skip() {
    goto('/onboarding/categories');
  }
</script>

<svelte:head><title>Your team · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Your team</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">
    Other shop owners may have invited you to join their team. Accept now, or skip and set up your own shop.
  </p>

  {#if data.invites.length === 0}
    <div class="flex flex-col items-center py-8 text-center mb-5 surface-card-flat">
      <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
           style="background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary);">
        <Inbox size={20} strokeWidth={1.75} />
      </div>
      <p class="text-[13px] font-semibold text-[var(--text)]">No pending invites</p>
      <p class="text-[12px] text-[var(--text-3)] mt-1 max-w-[260px]">
        You're all set. Continue to set up your own shop and categories.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3 mb-5">
      {#each data.invites as inv (inv.id)}
        <div class="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
               style="background:color-mix(in srgb, {roleColor[inv.role] ?? 'var(--primary)'} 15%, transparent)">
            <Store size={16} strokeWidth={1.75} style="color:{roleColor[inv.role] ?? 'var(--primary)'}" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold truncate">{inv.shop?.name ?? 'Shop'}</p>
            <p class="text-[10px] text-[var(--text-3)]">
              Invited as <span class="capitalize">{inv.role}</span>
              {#if inv.inviter?.first_name}by <strong>{inv.inviter.first_name}</strong>{/if}
            </p>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => act(inv.id, 'decline')} aria-label="Decline">
              <X size={13} strokeWidth={2} />
            </button>
            <button class="btn btn-primary btn-icon btn-sm" onclick={() => act(inv.id, 'accept')} aria-label="Accept" disabled={busyId === inv.id}>
              <Check size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex gap-2">
    <Button variant="secondary" href="/onboarding/appearance" class="flex-1 justify-center">
      Back
    </Button>
    <Button onclick={skip} class="flex-1 justify-center">
      {data.invites.length === 0 ? 'Continue →' : 'Skip — create my shop →'}
      <ArrowRight size={14} strokeWidth={2} />
    </Button>
  </div>
</div>
