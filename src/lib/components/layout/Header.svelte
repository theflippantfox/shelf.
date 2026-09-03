<script lang="ts">
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte";
  import { currentShop } from "$lib/stores/shop.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { inventory } from "$lib/stores/inventory.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import SyncBadge from "$lib/components/ui/SyncBadge.svelte";
  import {
    Moon,
    Sun,
    Bell,
    Settings,
    LogOut,
    ChevronDown,
    Search,
    Mail,
    Check,
    Store,
    Plus,
  } from "lucide-svelte";

  let { onOpenCommandBar }: { onOpenCommandBar?: () => void } = $props();

  const alertCount = $derived(inventory.alertCount);
  const inviteCount = $derived(currentShop.pendingInviteCount);
  const activeShops = $derived(currentShop.activeShops);
  const showSwitcher = $derived(activeShops.length > 1);

  // (label, href) per top-level section — used to build the breadcrumb
  // on the second-level pages (e.g. /settings/shop → "Settings / Shop details").
  const SECTION_TITLES: Record<string, [string, string]> = {
    "/":            ["Dashboard", "/"],
    "/sale":        ["Point of Sale", "/sale"],
    "/inventory":   ["Inventory", "/inventory"],
    "/customers":   ["Customers", "/customers"],
    "/history":     ["History", "/history"],
    "/analytics":   ["Analytics", "/analytics"],
    "/settings":    ["Settings", "/settings"],
    "/restocking":  ["Restocking", "/restocking"],
  };

  // Derive a [parentLabel?, parentHref?, currentLabel] triple from
  // the current pathname.
  const crumbs = $derived.by(() => {
    const path = $page.url.pathname;
    // Walk from longest matching section to shortest
    const matches = Object.entries(SECTION_TITLES)
      .filter(([route]) => route === "/" ? path === "/" : path.startsWith(route))
      .sort((a, b) => b[0].length - a[0].length);

    if (matches.length === 0) return null;
    const [route, [label, href]] = matches[0];
    // Are we on a child of this section?
    if (path === route) return { parent: null, current: label };
    // Build the child name from the last path segment
    const child = path.split("/").filter(Boolean).pop() ?? "";
    const pretty = child.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { parent: { label, href }, current: pretty };
  });

  let dropdownOpen = $state(false);
  let switchingId = $state<string | null>(null);

  function toggleTheme() {
    theme.setMode(theme.isDark ? "light" : "dark");
  }

  async function logout() {
    dropdownOpen = false;
    await fetch("/api/auth", { method: "DELETE" });
    goto("/login");
  }

  async function switchShop(shopId: string) {
    if (shopId === currentShop.data?.id) {
      dropdownOpen = false;
      return;
    }
    switchingId = shopId;
    try {
      await currentShop.switchTo(shopId);
      dropdownOpen = false;
      await invalidateAll();
    } catch (e) {
      console.error(e);
    } finally {
      switchingId = null;
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest("[data-dropdown]")) {
      dropdownOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<header
  class="sticky top-0 z-30 bg-[var(--bg)]/85 max-md:bg-[var(--bg)] backdrop-blur-md max-md:backdrop-blur-none border-b border-[var(--border)] px-4 md:px-6 h-12 flex items-center gap-3"
>
  {#if crumbs}
    <nav class="flex-1 flex items-center gap-1.5 min-w-0 text-[12.5px] font-medium" aria-label="Breadcrumb">
      {#if crumbs.parent}
        <a href={crumbs.parent.href} class="text-[var(--text-3)] hover:text-[var(--text)] transition-colors truncate">
          {crumbs.parent.label}
        </a>
        <span class="text-[var(--text-3)] opacity-50" aria-hidden="true">/</span>
        <span class="text-[var(--text)] font-semibold truncate">{crumbs.current}</span>
      {:else}
        <span class="text-[var(--text)] font-semibold truncate">{crumbs.current}</span>
      {/if}
    </nav>
  {:else}
    <span class="flex-1"></span>
  {/if}

  <div class="flex items-center gap-1">
    <!-- Search / Command bar trigger -->
    <button
      class="btn btn-ghost btn-sm gap-2 px-2.5 text-[var(--text-3)] hover:text-[var(--text)] group"
      onclick={() => onOpenCommandBar?.()}
      aria-label="Open command bar"
      title="Search (⌘K)"
    >
      <Search size={15} strokeWidth={1.75} />
      <span class="hidden md:inline text-[12px]">Search</span>
      <kbd class="hidden md:inline-flex items-center gap-0.5 text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text-3)] group-hover:text-[var(--text-2)]">
        ⌘K
      </kbd>
    </button>

    <!-- Theme toggle -->
    <button
      class="btn btn-ghost btn-icon btn-sm"
      onclick={toggleTheme}
      aria-label="Toggle theme"
      title={theme.isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {#if theme.isDark}
        <Sun size={16} strokeWidth={1.75} />
      {:else}
        <Moon size={16} strokeWidth={1.75} />
      {/if}
    </button>

    <!-- Pending sales sync badge (shows only when something is queued or syncing) -->
    <SyncBadge />

    <!-- Low-stock bell -->
    {#if alertCount > 0}
      <a
        href="/inventory?filter=alerts"
        class="btn btn-ghost btn-icon btn-sm relative"
        aria-label="{alertCount} stock alerts"
      >
        <Bell size={16} strokeWidth={1.75} />
        <span
          class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--crimson)]"
        ></span>
      </a>
    {/if}

    <!-- Pending team invites -->
    {#if inviteCount > 0}
      <a
        href="/invites"
        class="btn btn-ghost btn-icon btn-sm relative"
        aria-label="{inviteCount} pending team invite{inviteCount === 1 ? '' : 's'}"
        title="{inviteCount} pending invite{inviteCount === 1 ? '' : 's'}"
      >
        <Mail size={16} strokeWidth={1.75} />
        <span
          class="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--primary)] text-[var(--primary-fg)] text-[9px] font-bold flex items-center justify-center"
        >{inviteCount}</span>
      </a>
    {/if}

    <!-- Profile dropdown -->
    <div class="relative ml-1" data-dropdown>
      <button
        class="flex items-center gap-1.5 rounded-xl px-2 py-1 hover:bg-[var(--surface2)] transition-colors"
        onclick={() => (dropdownOpen = !dropdownOpen)}
        aria-label="Account menu"
        aria-expanded={dropdownOpen}
      >
        <Avatar name={auth.user?.name ?? ""} size={26} />
        <ChevronDown
          size={12}
          strokeWidth={2}
          class="text-[var(--text-3)] transition-transform duration-150"
          style="transform: rotate({dropdownOpen ? '180deg' : '0deg'})"
        />
      </button>

      {#if dropdownOpen}
        <div
          class="absolute right-0 top-full mt-1.5 w-56 card shadow-[var(--shadow-lg)] py-1 z-50"
          data-dropdown
        >
          <!-- User info -->
          <div class="px-3 py-2.5 border-b border-[var(--border)]">
            <p class="text-xs font-semibold truncate">{auth.user?.name}</p>
            <p class="text-[10px] text-[var(--text-3)] truncate">
              {auth.user?.email}
            </p>
            <span class="badge badge-neutral text-[9px] mt-1 capitalize"
              >{auth.role}</span
            >
          </div>

          <!-- Navigation items -->
          <div class="py-1">
            <a
              href="/settings"
              class="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[var(--surface2)] transition-colors"
              onclick={() => (dropdownOpen = false)}
            >
              <Settings
                size={13}
                strokeWidth={1.75}
                class="text-[var(--text-3)]"
              />
              Settings
            </a>
            <a
              href="/invites"
              class="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[var(--surface2)] transition-colors"
              onclick={() => (dropdownOpen = false)}
            >
              <Mail
                size={13}
                strokeWidth={1.75}
                class="text-[var(--text-3)]"
              />
              Invites
              {#if inviteCount > 0}
                <span class="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--primary-fg)]">{inviteCount}</span>
              {/if}
            </a>
          </div>

          <!-- Shop switcher (only when user has 2+ active shops) -->
          {#if showSwitcher}
            <div class="border-t border-[var(--border)] py-1">
              <p class="px-3 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Your shops</p>
              {#each activeShops as s (s.id)}
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[var(--surface2)] transition-colors disabled:opacity-50"
                  onclick={() => switchShop(s.id)}
                  disabled={switchingId !== null}
                >
                  <Store
                    size={13}
                    strokeWidth={1.75}
                    class="text-[var(--text-3)] flex-shrink-0"
                  />
                  <span class="flex-1 text-left truncate">{s.name}</span>
                  <span class="text-[9px] uppercase tracking-wide font-semibold text-[var(--text-3)]">{s.role}</span>
                  {#if currentShop.data?.id === s.id}
                    <Check size={12} strokeWidth={2.5} class="text-[var(--teal)] flex-shrink-0" />
                  {/if}
                </button>
              {/each}
              <a
                href="/invites"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-3)] hover:bg-[var(--surface2)] hover:text-[var(--text-2)] transition-colors"
                onclick={() => (dropdownOpen = false)}
              >
                <Plus size={13} strokeWidth={1.75} />
                Join another shop
              </a>
            </div>
          {/if}

          <div class="border-t border-[var(--border)] py-1">
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[var(--surface2)] text-[var(--crimson-fg)] transition-colors"
              onclick={logout}
            >
              <LogOut size={13} strokeWidth={1.75} />
              Log out
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
