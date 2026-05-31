<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { inventory } from "$lib/stores/inventory.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import {
    Moon,
    Sun,
    Bell,
    Settings,
    LogOut,
    ChevronDown,
  } from "lucide-svelte";

  const alertCount = $derived(inventory.alertCount);

  const PAGE_TITLES: Record<string, string> = {
    "/": "Dashboard",
    "/sale": "Point of Sale",
    "/inventory": "Inventory",
    "/customers": "Customers",
    "/history": "Sales History",
    "/analytics": "Analytics",
    "/settings": "Settings",
  };

  const pageTitle = $derived(() => {
    const path = $page.url.pathname;
    for (const [route, label] of Object.entries(PAGE_TITLES)) {
      if (route === "/" ? path === "/" : path.startsWith(route)) return label;
    }
    return "Shëlf";
  });

  let dropdownOpen = $state(false);

  function toggleTheme() {
    theme.set(theme.isDark ? "light" : "dark");
  }

  async function logout() {
    dropdownOpen = false;
    await fetch("/api/auth", { method: "DELETE" });
    goto("/login");
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
  class="sticky top-0 z-30 bg-[var(--bg)] border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-3"
>
  <h1 class="page-title flex-1 text-sm font-semibold">{pageTitle()}</h1>

  <div class="flex items-center gap-1">
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
          </div>

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
