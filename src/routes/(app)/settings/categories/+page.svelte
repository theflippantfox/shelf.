<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }     from '$lib/stores/toast.svelte';
  import { CATEGORY_COLORS } from '$lib/config/palettes';
  import PageShell   from '$lib/components/layout/PageShell.svelte';
  import Button      from '$lib/components/ui/Button.svelte';
  import Modal       from '$lib/components/ui/Modal.svelte';
  import Input       from '$lib/components/ui/Input.svelte';
  import ColorSwatch from '$lib/components/ui/ColorSwatch.svelte';
  import IconPicker  from '$lib/components/ui/IconPicker.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import EmptyState  from '$lib/components/ui/EmptyState.svelte';
  import { ArrowLeft, Plus, Pencil, Trash2, Grip } from 'lucide-svelte';

  let { data } = $props();

  let showModal = $state(false);
  let editing   = $state<any>(null);
  let saving    = $state(false);
  let deleting  = $state<string | null>(null);
  let form      = $state({ name: '', icon: 'sparkles', color: CATEGORY_COLORS[0] });

  function openAdd() {
    form    = { name: '', icon: 'sparkles', color: CATEGORY_COLORS[0] };
    editing = null;
    showModal = true;
  }

  function openEdit(c: any) {
    form    = { name: c.name, icon: c.icon.toLowerCase(), color: c.color };
    editing = c;
    showModal = true;
  }

  async function save() {
    if (!form.name.trim()) return;
    saving = true;
    const url    = editing ? `/api/categories/${editing.id}` : '/api/categories';
    const method = editing ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toasts.success(editing ? 'Category updated' : 'Category added');
      showModal = false;
      await invalidateAll();
    } else toasts.error('Failed to save category');
    saving = false;
  }

  async function archive(c: any) {
    if (!confirm(`Archive "${c.name}"?`)) return;
    deleting = c.id;
    const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
    if (res.ok) { 
      toasts.success('Category archived'); 
      await invalidateAll(); 
    } else {
      toasts.error('Failed to archive');
    }
    deleting = null;
  }
</script>

<svelte:head><title>Categories · Shëlf</title></svelte:head>

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">Categories</h1>
    <p class="text-[11.5px] text-[var(--text-3)] mt-0.5">Organize your inventory with custom categories</p>
  </div>
  <Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add</Button>
</header>

  {#if (data.categories as any[]).length === 0}
    <EmptyState icon="Tag" title="No categories yet" message="Add categories to organise your inventory.">
      {#snippet action()}<Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add category</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger-fade">
      {#each data.categories as cat}
        <div 
          class="surface-card p-4 md:p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
          style="border-left: 3px solid {(cat as any).color}"
        >
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div 
              class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110"
              style="background:color-mix(in srgb,{(cat as any).color} 15%,transparent)"
            >
              <DynamicIcon name={(cat as any).icon} size={18} style="color:{(cat as any).color}" />
            </div>
            
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold mb-1 truncate">{(cat as any).name}</p>
              <div class="flex items-center gap-1.5">
                <div 
                  class="w-3 h-3 rounded-full"
                  style="background:{(cat as any).color}"
                ></div>
                <span class="text-[10px] text-[var(--text-3)] font-mono">{(cat as any).color.toUpperCase()}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-1">
              <button 
                class="btn btn-ghost btn-icon btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
                onclick={() => openEdit(cat)}
                title="Edit category"
              >
                <Pencil size={13} strokeWidth={1.75} />
              </button>
              <button 
                class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)] opacity-0 group-hover:opacity-100 transition-opacity"
                onclick={() => archive(cat)}
                disabled={deleting === (cat as any).id}
                title="Archive category"
              >
                {#if deleting === (cat as any).id}
                  <div class="w-3 h-3 border-2 border-[var(--crimson)] border-t-transparent rounded-full animate-spin"></div>
                {:else}
                  <Trash2 size={13} strokeWidth={1.75} />
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Category count -->
    <div class="mt-4 text-center">
      <p class="text-xs text-[var(--text-3)]">
        {(data.categories as any[]).length} {(data.categories as any[]).length === 1 ? 'category' : 'categories'}
      </p>
    </div>
  {/if}
<Modal bind:open={showModal} title={editing ? 'Edit category' : 'New category'} maxWidth="max-w-sm">
  <div class="flex flex-col gap-4">
    <Input label="Name" bind:value={form.name} required />
    <div class="input-group">
      <p class="input-label">Colour</p>
      <ColorSwatch bind:value={form.color} />
    </div>
    <div class="input-group">
      <p class="input-label">Icon</p>
      <IconPicker bind:value={form.icon} />
    </div>
    <!-- Preview -->
    <div class="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-xl">
      <div class="w-9 h-9 rounded-lg flex items-center justify-center"
           style="background:color-mix(in srgb,{form.color} 20%,transparent)">
        <DynamicIcon name={form.icon} size={18} style="color:{form.color}" />
      </div>
      <span class="text-sm font-semibold">{form.name || 'Category name'}</span>
    </div>
  </div>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showModal = false}>Cancel</Button>
      <Button loading={saving} onclick={save}>Save</Button>
    </div>
  {/snippet}
</Modal>
