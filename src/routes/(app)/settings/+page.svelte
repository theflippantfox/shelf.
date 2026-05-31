<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import { ChevronRight } from 'lucide-svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';

  const sections = [
    { href: '/settings/shop',       icon: 'Store',      label: 'Shop details',   desc: 'Name, slug, contact info',         perm: 'settings.manage' },
    { href: '/settings/appearance', icon: 'Palette',    label: 'Appearance',     desc: 'Colours, theme, sidebar style',    perm: null },
    { href: '/settings/locale',     icon: 'Globe',      label: 'Locale',         desc: 'Currency, timezone, date format',  perm: 'settings.manage' },
    { href: '/settings/taxes',      icon: 'Percent',    label: 'Taxes',          desc: 'Tax rate, name, inclusive pricing',perm: 'settings.manage' },
    { href: '/settings/receipt',    icon: 'Receipt',    label: 'Receipt',        desc: 'Header and footer text',           perm: 'settings.manage' },
    { href: '/settings/categories', icon: 'Tag',        label: 'Categories',     desc: 'Manage product categories',        perm: 'settings.manage' },
    { href: '/settings/team',       icon: 'Users',      label: 'Team',           desc: 'Manage staff and permissions',     perm: 'users.manage' },
  ] as const;
</script>

<svelte:head><title>Settings · Shëlf</title></svelte:head>
<PageShell>
  <p class="text-base font-semibold mb-4">Settings</p>
  <div class="card overflow-hidden">
    {#each sections as s}
      {#if !s.perm || auth.can(s.perm as any)}
        <a
          href={s.href}
          class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
        >
          <div class="w-8 h-8 rounded-lg bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0">
            <DynamicIcon name={s.icon} size={15} class="text-[var(--primary)]" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold">{s.label}</p>
            <p class="text-[10px] text-[var(--text-3)]">{s.desc}</p>
          </div>
          <ChevronRight size={15} class="text-[var(--text-3)]" />
        </a>
      {/if}
    {/each}
  </div>
</PageShell>
