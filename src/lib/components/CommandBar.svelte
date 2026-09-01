<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { Search, Plus, BarChart3, Package, Users, Truck, History, Settings, Home, LogOut, Sun, Moon, ArrowRight } from 'lucide-svelte';
  import DynamicIcon from './ui/DynamicIcon.svelte';

  type CmdAction = {
    id:        string;
    label:     string;
    hint?:     string;
    group:     string;
    icon:      string;        // lucide name OR dynamic icon name
    kind?:     'page' | 'create' | 'theme' | 'logout' | 'search-product' | 'create-product';
    keywords?: string[];
    to?:       string;
    action?:   () => void | Promise<void>;
    data?:     Record<string, unknown>;  // for create-* actions
  };

  let { open = $bindable(false), products = [] }: { open?: boolean; products?: any[] } = $props();

  let query       = $state('');
  let activeIdx   = $state(0);
  let inputEl     = $state<HTMLInputElement | undefined>();
  let listEl      = $state<HTMLDivElement | undefined>();
  let themeDark   = $state(false);

  onMount(() => {
    themeDark = document.documentElement.classList.contains('dark');
  });

  // Static actions — pages, quick actions
  const staticActions = $derived<CmdAction[]>([
    { id: 'home',        label: 'Dashboard',   hint: 'Go to dashboard',         group: 'Pages',  icon: 'LayoutDashboard',  to: '/' },
    { id: 'sale-new',    label: 'New sale',     hint: 'Ring up a transaction',   group: 'Create', icon: 'Plus',             to: '/sale' },
    { id: 'sale',        label: 'Point of sale', hint: 'Cart + product picker',   group: 'Pages',  icon: 'ShoppingCart',     to: '/sale' },
    { id: 'inventory',   label: 'Inventory',    hint: 'Manage products & stock',  group: 'Pages',  icon: 'Package',          to: '/inventory' },
    { id: 'analytics',   label: 'Analytics',    hint: 'Revenue, profit, trends',  group: 'Pages',  icon: 'BarChart3',        to: '/analytics' },
    { id: 'history',     label: 'Sales history', hint: 'View all transactions',   group: 'Pages',  icon: 'History',          to: '/history' },
    { id: 'restock-new', label: 'New restock order', hint: 'Create purchase order', group: 'Create', icon: 'Plus',             to: '/restocking/orders/new' },
    { id: 'restocking',  label: 'Restocking',   hint: 'Suppliers, POs, receiving', group: 'Pages',  icon: 'Truck',            to: '/restocking' },
    { id: 'customers',   label: 'Customers',    hint: 'List & profiles',         group: 'Pages',  icon: 'Users',            to: '/customers' },
    { id: 'settings',    label: 'Settings',     hint: 'Shop, team, integrations', group: 'Pages',  icon: 'Settings',         to: '/settings' },
    { id: 'theme',       label: themeDark ? 'Switch to light mode' : 'Switch to dark mode', group: 'App', icon: themeDark ? 'Sun' : 'Moon', kind: 'theme' },
    { id: 'logout',      label: 'Log out',      hint: 'End your session',        group: 'App',    icon: 'LogOut',           kind: 'logout' },
  ]);

  // Dynamic results — products for quick add to a new sale
  const productResults = $derived<CmdAction[]>(
    (products ?? [])
      .filter((p: any) => p?.name && p.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6)
      .map((p: any) => ({
        id:        'p-' + p.id,
        label:     p.name,
        hint:      `₦${((p.price ?? 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })} · ${p.qty ?? 0} in stock`,
        group:     'Products',
        icon:      p.category?.icon ?? 'Package',
        kind:      'search-product',
        to:        '/sale',
        data:      { product: p },
      })),
  );

  const allActions = $derived<CmdAction[]>([...staticActions, ...productResults]);

  const filtered = $derived(
    query.trim()
      ? allActions.filter((a) => {
          const q = query.toLowerCase();
          return a.label.toLowerCase().includes(q) ||
                 a.hint?.toLowerCase().includes(q) ||
                 a.keywords?.some((k) => k.toLowerCase().includes(q));
        })
      : allActions,
  );

  // Group-by for display
  const groups = $derived(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    const byGroup: Record<string, CmdAction[]> = {};
    for (const a of filtered) {
      if (!seen.has(a.group)) { seen.add(a.group); order.push(a.group); }
      (byGroup[a.group] ??= []).push(a);
    }
    return order.map((g) => ({ name: g, items: byGroup[g] }));
  });

  // Flatten to find active index across groups
  const flat = $derived(groups().flatMap((g) => g.items));
  $effect(() => { if (activeIdx >= flat.length) activeIdx = 0; });

  // Scroll active into view
  $effect(() => {
    if (!open) return;
    queueMicrotask(() => {
      const el = listEl?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  });

  function select(action: CmdAction) {
    switch (action.kind) {
      case 'theme':
        themeDark = !themeDark;
        document.documentElement.classList.toggle('dark', themeDark);
        localStorage.setItem('theme', themeDark ? 'dark' : 'light');
        break;
      case 'logout':
        fetch('/api/auth', { method: 'DELETE' }).finally(() => goto('/login'));
        break;
      case 'search-product':
        if (action.to) goto(action.to);
        break;
      case 'create-product':
        // Future: a quick product create flow
        break;
      default:
        if (action.to) goto(action.to);
    }
    open = false;
    query = '';
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape')        { e.preventDefault(); open = false; query = ''; }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); activeIdx = Math.min(activeIdx + 1, flat.length - 1); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter')    {
      e.preventDefault();
      const a = flat[activeIdx];
      if (a) select(a);
    }
  }

  // Listen for ⌘K / Ctrl-K globally
  function onGlobalKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      open = !open;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onGlobalKey);
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onGlobalKey);
  });

  // Focus input on open
  $effect(() => {
    if (open) queueMicrotask(() => inputEl?.focus());
    else query = '';
  });

  // Build a flat index for keyboard nav
  let flatIndex = $state(0);
  $effect(() => {
    const f = groups().flatMap((g) => g.items);
    flatIndex = activeIdx;
    // keep flatIndex in sync
    if (flatIndex > f.length - 1) flatIndex = 0;
  });
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="fixed inset-0 z-[500] flex items-start justify-center pt-[12vh] px-3"
       transition:fade={{ duration: 150 }}>
    <button
      class="absolute inset-0 bg-black/30 backdrop-blur-sm"
      aria-label="Close command bar"
      onclick={() => { open = false; query = ''; }}
    ></button>

    <div
      class="relative w-full max-w-xl surface-elevated overflow-hidden anim-in"
      style="border-radius: 14px;"
      transition:fly={{ y: -10, duration: 180 }}
      role="dialog"
      aria-label="Command bar"
    >
      <div class="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
        <Search size={17} strokeWidth={1.75} class="text-[var(--text-3)] shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => (activeIdx = 0)}
          type="text"
          placeholder="Search pages, products, or type a command…"
          class="flex-1 bg-transparent outline-none text-[14px] text-[var(--text)] placeholder:text-[var(--text-3)]"
        />
        <kbd class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-3)] hidden sm:inline">esc</kbd>
      </div>

      <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto py-2">
        {#if groups().length === 0}
          <div class="px-4 py-8 text-center text-[var(--text-3)]">
            <p class="text-[13px] font-semibold text-[var(--text)]">No results</p>
            <p class="text-[11.5px] mt-0.5">Try “new sale” or “analytics”.</p>
          </div>
        {:else}
          {#each groups() as g, gi (g.name)}
            <p class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">{g.name}</p>
            {#each g.items as a, i}
              {@const idx = groups().slice(0, gi).reduce((s, x) => s + x.items.length, 0) + i}
              <button
                data-idx={idx}
                onclick={() => select(a)}
                onmouseenter={() => (activeIdx = idx)}
                class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors {activeIdx === idx ? 'bg-[var(--surface2)]' : ''}"
              >
                <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                     style="background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary)">
                  <DynamicIcon name={a.icon} size={14} />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-semibold text-[var(--text)] truncate">{a.label}</p>
                  {#if a.hint}<p class="text-[11px] text-[var(--text-3)] truncate">{a.hint}</p>{/if}
                </div>
                {#if activeIdx === idx}
                  <ArrowRight size={14} class="text-[var(--text-3)] shrink-0" strokeWidth={2} />
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[var(--border)] surface-inset">
        <div class="flex items-center gap-3 text-[10.5px] text-[var(--text-3)]">
          <span class="inline-flex items-center gap-1">
            <kbd class="font-mono text-[9.5px] px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)]">↑</kbd>
            <kbd class="font-mono text-[9.5px] px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)]">↓</kbd>
            navigate
          </span>
          <span class="inline-flex items-center gap-1">
            <kbd class="font-mono text-[9.5px] px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)]">↵</kbd>
            select
          </span>
        </div>
        <p class="text-[10px] text-[var(--text-3)]">
          {flat.length} result{flat.length === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  </div>
{/if}