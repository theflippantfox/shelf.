<script lang="ts">
  /**
   * Tiny online/offline pill in the top-right. Reads `navigator.onLine` and
   * listens for the browser's `online` / `offline` events so it stays
   * accurate when the device flaps between networks.
   *
   * Behavior:
   *  - Online  → hidden (no UI cost when everything is fine).
   *  - Offline → persistent gold pill: "Offline · changes won't sync".
   *  - Online → shows a brief "Back online" toast-like pill for ~3s, then hides.
   */
  import { onMount } from 'svelte';
  import { WifiOff, Wifi } from 'lucide-svelte';

  let online  = $state(true);
  let justReconnected = $state(false);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    online = navigator.onLine;
    const onOnline = () => {
      online = true;
      justReconnected = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => (justReconnected = false), 3000);
    };
    const onOffline = () => {
      online = false;
      justReconnected = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  });
</script>

{#if !online}
  <!-- Offline: persistent, dismissible in tone -->
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