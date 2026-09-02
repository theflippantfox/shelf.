<script lang="ts">
  /**
   * Tiny online/offline pill in the top-right. Reads `offlineSync.online`
   * (which listens for `navigator.onLine` and the `online`/`offline`
   * window events in one place — see `lib/offline/offlineSync.svelte.ts`).
   *
   * Behavior:
   *  - Online  → hidden (no UI cost when everything is fine).
   *  - Offline → persistent gold pill: "You're offline".
   *  - Online (just reconnected) → brief "Back online" pill for ~3s.
   */
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { WifiOff, Wifi } from 'lucide-svelte';

  let justReconnected = $state(false);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // React to the shared online state instead of listening to the
  // window events ourselves.  When online flips to true, briefly
  // show the "Back online" pill, then hide it.
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
</script>

{#if !offlineSync.online}
  <!-- Offline: persistent -->
  <div
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-[var(--shadow)]"
    style="background:var(--gold); color:#fff"
    role="status"
    aria-live="polite"
  >
    <WifiOff size={12} strokeWidth={2.5} />
    You're offline
  </div>
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
