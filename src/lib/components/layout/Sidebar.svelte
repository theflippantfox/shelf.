<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { navItems } from "$lib/config/nav";
  import { ICONS } from "$lib/config/icons";
  import { auth } from "$lib/stores/auth.svelte";
  import { currentShop } from "$lib/stores/shop.svelte";
  import { inventory } from "$lib/stores/inventory.svelte";
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import { LogOut } from "lucide-svelte";

  const alertCount = $derived(inventory.alertCount);
  const visibleItems = $derived(
    navItems.filter((i) => !i.permission || auth.can(i.permission as any)),
  );

  const grouped = $derived(() => {
    const g: Record<string, typeof navItems> = {};
    for (const item of visibleItems) {
      const s = item.section ?? "Other";
      if (!g[s]) g[s] = [];
      g[s].push(item);
    }
    return g;
  });

  function isActive(href: string) {
    if (href === "/") return $page.url.pathname === "/";
    return $page.url.pathname.startsWith(href);
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    goto("/login");
  }
</script>

<aside class="sidebar hidden md:flex">
  <div class="sidebar-brand">
    <span class="sidebar-brand-text"
      >Shëlf<span class="sidebar-brand-dot">.</span></span
    >
    {#if currentShop.data?.name}
      <p class="text-[10px] text-white/30 mt-0.5 truncate">
        {currentShop.data.name}
      </p>
    {/if}
  </div>

  <nav class="flex-1 overflow-y-auto py-2">
    {#each Object.entries(grouped()) as [section, items]}
      <p class="sidebar-section-lbl">{section}</p>
      {#each items as item}
        <a
          href={item.href}
          class="sidebar-item {isActive(item.href) ? 'active' : ''}"
          aria-current={isActive(item.href) ? "page" : undefined}
        >
          <span class="sidebar-item-icon">
            <DynamicIcon
              name={ICONS[item.icon as keyof typeof ICONS] ?? item.icon}
              size={17}
              strokeWidth={1.75}
            />
          </span>
          <span class="flex-1">{item.label}</span>
          {#if item.showAlert && alertCount > 0}
            <span class="badge badge-crimson text-[10px] px-1.5 py-0"
              >{alertCount}</span
            >
          {/if}
        </a>
      {/each}
    {/each}
  </nav>

  <div class="sidebar-footer">
    <div class="flex items-center gap-2">
      <Avatar name={auth.user?.name ?? ""} size={28} />
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-white/70 truncate">
          {auth.user?.name}
        </p>
        <p class="text-[10px] text-white/35 capitalize">{auth.role}</p>
      </div>
      <button
        class="btn btn-ghost btn-icon btn-sm"
        onclick={logout}
        title="Log out"
      >
        <LogOut
          size={15}
          strokeWidth={1.75}
          style="color:rgba(255,255,255,0.4)"
        />
      </button>
    </div>
  </div>
</aside>
