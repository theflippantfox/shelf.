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

  onMount(() => {
    if (typeof window === "undefined") return;
    updateViewportOffset();
    const vv = window.visualViewport;
    // visualViewport is the most reliable signal on mobile; it fires on
    // every scroll/zoom/pan that changes the visible area.
    vv?.addEventListener("resize",  updateViewportOffset);
    vv?.addEventListener("scroll",  updateViewportOffset);
    // The layout viewport can also change (rotation, address-bar show
    // / hide that does fire resize on Android).
    window.addEventListener("resize", updateViewportOffset);
    // When the soft keyboard opens / closes, the visual viewport
    // changes height but `resize` doesn't always fire on every browser
    // — this extra listener catches focus-in on any form element.
    document.addEventListener("focusin",  updateViewportOffset);
    document.addEventListener("focusout", updateViewportOffset);
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    vv?.removeEventListener("resize",  updateViewportOffset);
    vv?.removeEventListener("scroll",  updateViewportOffset);
    window.removeEventListener("resize", updateViewportOffset);
    document.removeEventListener("focusin",  updateViewportOffset);
    document.removeEventListener("focusout", updateViewportOffset);
  });
</script>

<nav class="bottom-nav md:hidden" aria-label="Main navigation">
  {#each leftItems as item}
    <a
      href={item.href}
      class="bottom-nav-item {isActive(item.href) ? 'active' : ''}"
      aria-current={isActive(item.href) ? "page" : undefined}
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
