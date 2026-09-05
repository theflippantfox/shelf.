<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { currentShop } from '$lib/stores/shop.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Check, X, Store, Inbox } from 'lucide-svelte';

  let { data } = $props();
  let busyId = $state<string | null>(null);

  const roleColor: Record<string, string> = {
    owner: 'var(--gold)', manager: 'var(--primary)', cashier: 'var(--cobalt)',
  };

  async function act(id: string, action: 'accept' | 'decline') {
    busyId = id;
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_member_id: id, action }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (action === 'accept') {
        toasts.success(`Joined ${updated.shop?.name ?? 'shop'}!`);
        // Switch to the new shop so the user lands in the right context.
        if (updated.shop?.id) {
          await fetch('/api/auth/select-shop', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopId: updated.shop.id }),
          });
        }
        // Refresh the shop list in the switcher (the user now has a
        // new active shop). Fire and forget — the page navigation
        // will re-run the layout's load() anyway.
        try {
          const r = await fetch('/api/auth/my-shops');
          if (r.ok) currentShop.setAllShops(await r.json());
        } catch { /* offline */ }
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
</script>

<svelte:head><title>Invites · Shëlf</title></svelte:head>

<PageShell title="Invites" subtitle="Shops that want you on their team.">

  {#if data.invites.length === 0}
    <div class="surface-card p-10 flex flex-col items-center gap-3 text-center">
      <div class="w-12 h-12 rounded-full bg-[var(--surface2)] flex items-center justify-center text-[var(--text-3)]">
        <Inbox size={20} strokeWidth={1.5} />
      </div>
      <p class="text-sm font-semibold">No pending invites</p>
      <p class="text-xs text-[var(--text-3)] max-w-sm">
        When a shop owner invites you by email, you'll see the invite here and can accept it to join the team.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each data.invites as inv (inv.id)}
        <div class="surface-card p-4 flex items-center gap-3">
          <div class="w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center"
               style="background:color-mix(in srgb, {roleColor[inv.role] ?? 'var(--primary)'} 15%, transparent)">
            <Store size={18} strokeWidth={1.75} style="color:{roleColor[inv.role] ?? 'var(--primary)'}" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-semibold truncate">{inv.shop?.name ?? 'Shop'}</p>
              <span class="text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded-full"
                    style="background:color-mix(in srgb, {roleColor[inv.role] ?? 'var(--primary)'} 15%, transparent); color:{roleColor[inv.role] ?? 'var(--primary)'}">
                {inv.role}
              </span>
            </div>
            <p class="text-[11px] text-[var(--text-3)] mt-0.5">
              Invited {new Date(inv.invited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {#if inv.inviter?.first_name}by <strong class="text-[var(--text-2)]">{inv.inviter.first_name}</strong>{/if}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <Button variant="secondary" size="sm" loading={busyId === inv.id} onclick={() => act(inv.id, 'decline')}>
              <X size={13} strokeWidth={2} /> Decline
            </Button>
            <Button size="sm" loading={busyId === inv.id} onclick={() => act(inv.id, 'accept')}>
              <Check size={13} strokeWidth={2} /> Accept
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</PageShell>
