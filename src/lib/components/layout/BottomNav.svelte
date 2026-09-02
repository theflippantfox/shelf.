<script lang="ts">
  import { page } from "$app/stores";
  import { navItems } from "$lib/config/nav";
  import { ICONS } from "$lib/config/icons";
  import { auth } from "$lib/stores/auth.svelte";
  import { inventory } from "$lib/stores/inventory.svelte";
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import { ShoppingCart } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";

  const mobileItems = $derived(
    navItems
      .filter((i) => i.mobileNav && (!i.permission || auth.can(i.permission)))
      .sort((a, b) => (a.mobileOrder ?? 99) - (b.mobileOrder ?? 99)),
  );

  const alertCount = $derived(inventory.alertCount);

  function isActive(href: string) {
    if (href === "/") return $page.url.pathname === "/";
    return $page.url.pathname.startsWith(href);
  }

  // Split into left/right of FAB
  const leftItems = $derived(mobileItems.slice(0, 2));
  const rightItems = $derived(mobileItems.slice(2));

  /*
   * Mobile viewport tracking.
   *
   * `position: fixed; bottom: 0` is anchored to the *layout* viewport on
   * most mobile browsers, but the user actually sees the *visual*
   * viewport (which excludes the URL bar, the iOS bottom bar, and the
   * soft keyboard). The two diverge when:
   *   - the user scrolls and the URL bar collapses
   *   - the soft keyboard opens
   *   - the orientation changes
   *   - the user pulls-to-refresh
   *
   * On iOS Safari in particular, the URL bar can collapse *without*
   * firing a `resize` event, so a fixed-positioned element appears to
   * hover in the middle of the screen at the old bottom.
   *
   * Fix: track `window.visualViewport` and re-anchor the nav by writing
   * a CSS variable that the .bottom-nav uses. The listener fires
   * continuously during scroll, so the nav stays glued to the visible
   * bottom edge.
   */
  function updateViewportOffset() {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    // Distance from the bottom of the layout viewport to the bottom of
    // the visual viewport. Positive when the visual viewport is shorter
    // (keyboard up, address bar visible, etc.) — that's the amount we
    // need to lift the nav so it stays at the visible bottom.
    const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty("--vv-bottom", `${offset}px`);
  }

  /*
   * Smooth update loop.
   *
   * visualViewport events fire on the right hooks (URL bar show/hide,
   * keyboard, rotation) but during a fast inertial scroll the
   * intermediate states arrive in batches and the nav visibly hops —
   * it lifts to the URL-bar-visible offset, then snaps to the
   * URL-bar-hidden offset when scroll lands.
   *
   * Solution: use a rAF loop keyed off `requestAnimationFrame` while
   * a scroll is in progress, and keep it running for ~150ms after the
   * last scroll event to catch the settle. rAF runs at the display
   * refresh rate (60–120Hz), so the --vv-bottom variable updates
   * continuously and the CSS sees a smooth animation.
   */
  let rafId = 0;
  let settleTimer = 0;
  function scheduleUpdate() {
    if (settleTimer) clearTimeout(settleTimer);
    if (!rafId) {
      const tick = () => {
        rafId = 0;
        updateViewportOffset();
      };
      rafId = requestAnimationFrame(tick);
    }
    settleTimer = window.setTimeout(() => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      updateViewportOffset();
    }, 180);
  }

  onMount(() => {
    if (typeof window === "undefined") return;
    updateViewportOffset();
    const vv = window.visualViewport;
    // visualViewport is the most reliable signal on mobile; it fires on
    // every scroll/zoom/pan that changes the visible area.
    vv?.addEventListener("resize",  scheduleUpdate);
    vv?.addEventListener("scroll",  scheduleUpdate);
    // The layout viewport can also change (rotation, address-bar show
    // / hide that does fire resize on Android).
    window.addEventListener("resize", scheduleUpdate);
    // When the soft keyboard opens / closes, the visual viewport
    // changes height but `resize` doesn't always fire on every browser
    // — this extra listener catches focus-in on any form element.
    document.addEventListener("focusin",  scheduleUpdate);
    document.addEventListener("focusout", scheduleUpdate);
    // Page scroll on mobile drives the URL-bar collapse animation; the
    // visualViewport resize event lags behind the scroll, so listen to
    // window scroll too and feed it through the rAF loop.
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    vv?.removeEventListener("resize",  scheduleUpdate);
    vv?.removeEventListener("scroll",  scheduleUpdate);
    window.removeEventListener("resize", scheduleUpdate);
    document.removeEventListener("focusin",  scheduleUpdate);
    document.removeEventListener("focusout", scheduleUpdate);
    window.removeEventListener("scroll", scheduleUpdate);
    if (rafId) cancelAnimationFrame(rafId);
    if (settleTimer) clearTimeout(settleTimer);
  });
</script>

<nav class="bottom-nav md:hidden" aria-label="Main navigation">
  {#each leftItems as item}
    <a
      href={item.href}
      class="bottom-nav-item {isActive(item.href) ? 'active' : ''}"
      aria-current={isActive(item.href) ? "page" : undefined}
      data-sveltekit-preload-data="hover"
    >
      <div class="relative">
        <DynamicIcon
          name={ICONS[item.icon as keyof typeof ICONS] ?? item.icon}
          size={20}
          strokeWidth={1.75}
        />
        {#if item.showAlert && alertCount > 0}
          <span
            class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--crimson)] text-white text-[8px] font-bold flex items-center justify-center"
          >
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        {/if}
      </div>
      <span>{item.label}</span>
    </a>
  {/each}

  <!-- FAB — Point of Sale -->
  <div class="bottom-nav-fab">
    <a href="/sale" class="bottom-nav-fab-btn" aria-label="New Sale">
      <ShoppingCart size={22} strokeWidth={1.75} />
    </a>
    <span class="bottom-nav-fab-lbl">Sale</span>
  </div>

  {#each rightItems as item}
    <a
      href={item.href}
      class="bottom-nav-item {isActive(item.href) ? 'active' : ''}"
      aria-current={isActive(item.href) ? "page" : undefined}
      data-sveltekit-preload-data="hover"
    >
      <DynamicIcon
        name={ICONS[item.icon as keyof typeof ICONS] ?? item.icon}
        size={20}
        strokeWidth={1.75}
      />
      <span>{item.label}</span>
    </a>
  {/each}
</nav>
