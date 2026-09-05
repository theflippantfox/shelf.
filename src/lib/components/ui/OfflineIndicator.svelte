<script lang="ts">
  /**
   * Online/offline pill + pending-sync indicator.
   *
   *  - Offline (persistent, gold): "You're offline · N pending"
   *  - Online with pending ops: small "N pending" pill with a
   *    spinner + "Sync now" button
   *  - Online, no pending: hidden
   *  - Just reconnected: brief "Back online" confirmation
   */
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { WifiOff, Wifi, RefreshCw, CloudOff } from 'lucide-svelte';

  let justReconnected = $state(false);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let syncing = $state(false);

  $effect(() => {
    if (offlineSync.online) {
      justReconnected = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => (justReconnected = false), 3000);
    } else {
      justReconnected = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  });

  async function syncNow() {
    syncing = true;
    try {
      await offlineSync.syncNow();
      if (offlineSync.pendingCount === 0) {
        toasts.success('All synced');
      } else if (offlineSync.lastError) {
        toasts.error(`Sync error: ${offlineSync.lastError}`);
      } else {
        toasts.info(`${offlineSync.pendingCount} still pending`);
      }
    } catch (e: any) {
      toasts.error(e?.message ?? 'Sync failed');
    } finally {
      syncing = false;
    }
  }
</script>

{#if !offlineSync.online}
  <!-- Offline: persistent, shows pending count -->
  <div
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-[var(--shadow)]"
    style="background:var(--gold); color:#fff"
    role="status"
    aria-live="polite"
  >
    <CloudOff size={12} strokeWidth={2.5} />
    <span>You're offline</span>
    {#if offlineSync.pendingCount > 0}
      <span class="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold"
            style="background:rgba(0,0,0,0.25)">
        {offlineSync.pendingCount} pending
      </span>
    {/if}
  </div>
{:else if offlineSync.pendingCount > 0}
  <!-- Online but ops are pending (from a previous offline session,
       or because they hit a backoff and are waiting) -->
  <button
    type="button"
    onclick={syncNow}
    disabled={syncing || offlineSync.syncing}
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-[var(--shadow)] active:scale-95 transition-transform disabled:opacity-70"
    style="background:var(--cobalt); color:#fff"
    title="Click to sync now"
  >
    {#if syncing || offlineSync.syncing}
      <RefreshCw size={12} strokeWidth={2.5} class="animate-spin" />
      <span>Syncing…</span>
    {:else}
      <RefreshCw size={12} strokeWidth={2.5} />
      <span>{offlineSync.pendingCount} pending</span>
      <span class="font-normal opacity-90">· Sync now</span>
    {/if}
  </button>
{:else if justReconnected}
  <!-- Just reconnected: brief confirmation -->
  <div
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-[var(--shadow)] animate-[fadeIn_200ms]"
    style="background:var(--teal); color:#fff"
    role="status"
    aria-live="polite"
  >
    <Wifi size={12} strokeWidth={2.5} />
    Back online
  </div>
{/if}
