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
  import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-svelte';

  let { data } = $props();

  let showModal = $state(false);
  let editing   = $state<any>(null);
  let saving    = $state(false);
  let form      = $state({ name: '', icon: 'Sparkles', color: CATEGORY_COLORS[0] });

  function openAdd() {
    form    = { name: '', icon: 'Sparkles', color: CATEGORY_COLORS[0] };
    editing = null;
    showModal = true;
  }

  function openEdit(c: any) {
    form    = { name: c.name, icon: c.icon, color: c.color };
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
    const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
    if (res.ok) { toasts.success('Category archived'); await invalidateAll(); }
    else toasts.error('Failed to archive');
  }
</script>

<svelte:head><title>Categories · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <p class="font-semibold text-sm flex-1">Categories</p>
    <Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add</Button>
  </div>

  {#if (data.categories as any[]).length === 0}
    <EmptyState icon="Tag" title="No categories yet" message="Add categories to organise your inventory.">
      {#snippet action()}<Button size="sm" onclick={openAdd}><Plus size={14} strokeWidth={2} /> Add category</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="card overflow-hidden">
      {#each data.categories as cat}
        <div class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)]">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style="background:color-mix(in srgb,{(cat as any).color} 18%,transparent)">
            <DynamicIcon name={(cat as any).icon} size={15} style="color:{(cat as any).color}" />
          </div>
          <p class="text-xs font-semibold flex-1">{(cat as any).name}</p>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-icon btn-sm" onclick={() => openEdit(cat)}>
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => archive(cat)}>
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</PageShell>

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
