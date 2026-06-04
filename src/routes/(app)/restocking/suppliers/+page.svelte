<script lang="ts">
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { api } from '$lib/utils/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { page } from '$app/stores';

  let suppliers: any[] = [];
  let loading = true;
  let showAdd = false;
  let editingSupplier = null;

  let form = {
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    payment_terms: 'cash',
    currency_code: 'USD',
    lead_time_days: '',
    notes: '',
  };

  onMount(async () => {
    try {
      suppliers = await api('GET', '/api/suppliers');
    } catch (e) {
      toasts.error('Failed to load suppliers');
    } finally {
      loading = false;
    }
  });

  function openAdd() {
    form = {
      name: '', contact_name: '', phone: '', email: '', address: '',
      payment_terms: 'cash', currency_code: 'USD', lead_time_days: '', notes: '',
    };
    editingSupplier = null;
    showAdd = true;
  }

  function openEdit(s: any) {
    form = {
      name: s.name,
      contact_name: s.contact_name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      payment_terms: s.payment_terms || 'cash',
      currency_code: s.currency_code || 'USD',
      lead_time_days: s.lead_time_days ? String(s.lead_time_days) : '',
      notes: s.notes || '',
    };
    editingSupplier = s;
    showAdd = true;
  }

  async function saveSupplier() {
    if (!form.name) return toasts.error('Supplier name is required');

    try {
      const payload = {
        ...form,
        lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      };

      if (editingSupplier) {
        await api('PATCH', `/api/suppliers/${editingSupplier.id}`, payload);
        toasts.success('Supplier updated');
      } else {
        await api('POST', '/api/suppliers', payload);
        toasts.success('Supplier created');
      }
      
      showAdd = false;
      suppliers = await api('GET', '/api/suppliers');
    } catch (e) {
      toasts.error('Failed to save supplier');
    }
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Are you sure you want to deactivate this supplier?')) return;
    try {
      await api('DELETE', `/api/suppliers/${id}`);
      toasts.success('Supplier deactivated');
      suppliers = await api('GET', '/api/suppliers');
    } catch (e) {
      toasts.error('Failed to deactivate supplier');
    }
  }
</script>

<PageShell title="Suppliers">
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Suppliers</p>
      <p class="text-xs text-[var(--text-3)]">Manage your product sources & terms</p>
    </div>
    <Button onclick={openAdd} size="sm">
      <span class="flex items-center gap-1">
        <span class="text-xs">➕</span> Add Supplier
      </span>
    </Button>
  </div>

  <div class="p-4 space-y-6">
    {#if loading}
      <div class="flex justify-center p-12">
        <span class="animate-spin">🌀</span>
      </div>
    {:else}
      <div class="card overflow-hidden">
        <table class="tbl">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Contact</th>
              <th>Payment Terms</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each suppliers as s}
              <tr>
                <td>
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold">{s.name}</span>
                    <span class="text-[10px] text-[var(--text-3)]">{s.email || 'No email'}</span>
                  </div>
                </td>
                <td>
                  <div class="flex flex-col">
                    <span class="text-xs">{s.contact_name || 'N/A'}</span>
                    <span class="text-[10px] text-[var(--text-3)]">{s.phone || 'No phone'}</span>
                  </div>
                </td>
                <td class="text-xs">{s.payment_terms}</td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" class="p-1 h-8 w-8" onclick={() => openEdit(s)}>
                      <span class="text-xs">✏️</span>
                    </Button>
                    <Button variant="ghost" class="p-1 h-8 w-8 text-danger" onclick={() => deleteSupplier(s.id)}>
                      <span class="text-xs">🗑️</span>
                    </Button>
                  </div>
                </td>
              </tr>
            {/each}
            {#if suppliers.length === 0}
              <tr>
                <td colspan="4" class="p-8 text-center text-muted-foreground text-xs">
                  No suppliers found.
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <Modal bind:open={showAdd} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'} maxWidth="max-w-md">
    <div class="flex flex-col gap-4 p-2">
      <Input label="Company Name" bind:value={form.name} required />
      <div class="grid grid-cols-2 gap-4">
        <Input label="Contact Person" bind:value={form.contact_name} />
        <Input label="Phone" bind:value={form.phone} />
      </div>
      <Input label="Email" bind:value={form.email} />
      <Input label="Address" bind:value={form.address} />
      <div class="grid grid-cols-2 gap-4">
        <Select 
          label="Payment Terms" 
          bind:value={form.payment_terms} 
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'credit', label: 'Credit' },
            { value: 'net_15', label: 'Net 15' },
            { value: 'net_30', label: 'Net 30' },
            { value: 'net_60', label: 'Net 60' },
            { value: 'consignment', label: 'Consignment' },
          ]} 
          optionLabel="label" 
          optionValue="value" 
        />
        <Input label="Currency Code" bind:value={form.currency_code} placeholder="USD" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <Input label="Lead Time (days)" type="number" bind:value={form.lead_time_days} />
        <div class="flex items-end">
          <!-- is_active is handled as a soft-delete on delete, default true on create -->
        </div>
      </div>
      <Input label="Internal Notes" bind:value={form.notes} />
      <div class="flex justify-end gap-3 pt-4">
        <Button variant="ghost" onclick={() => showAdd = false}>Cancel</Button>
        <Button variant="primary" onclick={saveSupplier}>Save Supplier</Button>
      </div>
    </div>
  </Modal>
</PageShell>
