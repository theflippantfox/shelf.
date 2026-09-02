<script lang="ts">
  /**
   * SyncBadge — small pill in the header showing pending offline sales.
   *
   *  - pendingCount > 0, not syncing → gold pill "N pending" (CloudOff icon)
   *  - syncing                      → cobalt pill "Syncing…" (spinner)
   *  - nothing pending              → hidden
   *
   * Click triggers a manual flush.  Useful when the user sees the
   * online indicator return but wants to push immediately rather
   * than wait for the boot-time drain.
   */
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { CloudOff, RefreshCw } from 'lucide-svelte';
</script>

{#if offlineSync.pendingCount > 0 || offlineSync.syncing}
  <button
    type="button"
    class="sync-badge inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold tabular-nums border transition-colors"
    class:sync-badge--pending={!offlineSync.syncing}
    class:sync-badge--syncing={offlineSync.syncing}
    onclick={() => { void offlineSync.flushPendingSales(); }}
    title="Click to sync now"
    aria-label="Sync {offlineSync.pendingCount} pending sale{offlineSync.pendingCount === 1 ? '' : 's'}"
  >
    {#if offlineSync.syncing}
      <RefreshCw size={11} strokeWidth={2.5} class="animate-spin" />
      <span>Syncing…</span>
    {:else}
      <CloudOff size={11} strokeWidth={2.5} />
      <span>{offlineSync.pendingCount} pending</span>
    {/if}
  </button>
{/if}

<style>
  .sync-badge {
    border-color: color-mix(in srgb, currentColor 24%, transparent);
  }
  .sync-badge--pending {
    background: var(--gold-dim);
    color: var(--gold-fg);
  }
  .sync-badge--syncing {
    background: var(--cobalt-dim);
    color: var(--cobalt);
  }
  .sync-badge:hover {
    border-color: color-mix(in srgb, currentColor 50%, transparent);
  }
</style>
