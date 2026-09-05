<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { Store, Palette, Globe, Percent, Receipt, Tag, Users, ArrowRight } from 'lucide-svelte';

  // All settings entries — visible to every role. Restricted actions
  // (saving, etc.) are still gated server-side.
  const sections = [
    { href: '/settings/shop',       icon: Store,   label: 'Shop',        desc: 'Name, slug, contact info',        tone: 'cobalt'  },
    { href: '/settings/appearance', icon: Palette, label: 'Appearance',  desc: 'Palette, theme, sidebar style',   tone: 'violet'  },
    { href: '/settings/locale',     icon: Globe,   label: 'Locale',      desc: 'Currency, timezone, date format', tone: 'teal'    },
    { href: '/settings/taxes',      icon: Percent, label: 'Taxes',       desc: 'Tax rate, name, inclusive pricing', tone: 'gold'  },
    { href: '/settings/receipt',    icon: Receipt, label: 'Receipt',     desc: 'Header and footer text',          tone: 'lime'    },
    { href: '/settings/categories', icon: Tag,     label: 'Categories',  desc: 'Manage product categories',       tone: 'crimson' },
    { href: '/settings/team',       icon: Users,   label: 'Team',        desc: 'Manage staff and permissions',    tone: 'primary' },
  ];
</script>

<svelte:head><title>Settings · Shëlf</title></svelte:head>

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
      Settings
    </h1>
  </div>
</header>

<div class="surface-card overflow-hidden">
  {#each sections as s, i}
    <a
      href={s.href}
      class="flex items-center gap-3.5 px-4 md:px-5 py-3.5 hover:bg-[var(--surface2)] transition-colors {i < sections.length - 1 ? 'border-b border-[var(--border)]' : ''}"
    >
      <div class="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 icon-tint-{s.tone}">
        <DynamicIcon name={s.icon as any} size={16} />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[13.5px] font-semibold text-[var(--text)]">{s.label}</p>
      </div>
      <ArrowRight size={15} class="text-[var(--text-3)] flex-shrink-0" strokeWidth={1.75} />
    </a>
  {/each}
</div>