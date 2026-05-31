<script lang="ts">
  import { page } from "$app/stores";
  import { navItems } from "$lib/config/nav";
  import { ICONS } from "$lib/config/icons";
  import { auth } from "$lib/stores/auth.svelte";
  import { inventory } from "$lib/stores/inventory.svelte";
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import { ShoppingCart } from "lucide-svelte";

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
