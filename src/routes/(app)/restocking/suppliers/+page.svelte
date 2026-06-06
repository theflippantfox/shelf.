<script lang="ts">
  import { onMount } from "svelte";
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { toasts } from "$lib/stores/toast.svelte";
  import { Pencil, Trash2, Plus, Truck } from "lucide-svelte";

  let suppliers: any[] = $state([]);
  let loading = $state(true);
  let showAdd = $state(false);
  let showDelete = $state(false);
  let editingSupplier = $state<any>(null);
  let deleteTarget = $state<any>(null);
  let saving = $state(false);

  let form = $state({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    payment_terms: "cash",
    currency_code: "USD",
    lead_time_days: "",
    notes: "",
  });

  const PAYMENT_TERMS = [
    { value: "cash", label: "Cash" },
    { value: "credit", label: "Credit" },
    { value: "net_15", label: "Net 15 days" },
    { value: "net_30", label: "Net 30 days" },
    { value: "net_60", label: "Net 60 days" },
    { value: "consignment", label: "Consignment" },
  ];

  onMount(async () => {
    await loadSuppliers();
  });

  async function loadSuppliers() {
    loading = true;
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) suppliers = await res.json();
      else toasts.error("Failed to load suppliers");
    } catch {
      toasts.error("Network error");
    } finally {
      loading = false;
    }
  }

  function openAdd() {
    form = {
      name: "",
      contact_name: "",
      phone: "",
      email: "",
      address: "",
      payment_terms: "cash",
      currency_code: "USD",
      lead_time_days: "",
      notes: "",
    };
    editingSupplier = null;
    showAdd = true;
  }

  function openEdit(s: any) {
    form = {
      name: s.name,
      contact_name: s.contact_name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      payment_terms: s.payment_terms ?? "cash",
      currency_code: s.currency_code ?? "USD",
      lead_time_days: s.lead_time_days != null ? String(s.lead_time_days) : "",
      notes: s.notes ?? "",
    };
    editingSupplier = s;
    showAdd = true;
  }

  async function saveSupplier() {
    if (!form.name.trim()) {
      toasts.error("Supplier name is required");
      return;
    }
    saving = true;
    try {
      const payload = {
        ...form,
        lead_time_days: form.lead_time_days
          ? parseInt(form.lead_time_days)
          : null,
      };
      const url = editingSupplier
        ? `/api/suppliers/${editingSupplier.id}`
        : "/api/suppliers";
      const method = editingSupplier ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toasts.success(editingSupplier ? "Supplier updated" : "Supplier added");
        showAdd = false;
        await loadSuppliers();
      } else {
        const d = await res.json().catch(() => ({}));
        toasts.error(d.error ?? "Failed to save supplier");
      }
    } catch {
      toasts.error("Network error");
    } finally {
      saving = false;
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/suppliers/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toasts.success("Supplier deactivated");
      showDelete = false;
      deleteTarget = null;
      await loadSuppliers();
    } else toasts.error("Failed to deactivate supplier");
  }

  const TERM_LABELS: Record<string, string> = {
    cash: "Cash",
    credit: "Credit",
    net_15: "Net 15",
    net_30: "Net 30",
    net_60: "Net 60",
    consignment: "Consignment",
  };
</script>

<svelte:head><title>Suppliers · Shëlf</title></svelte:head>

<!-- ─── Page content ─────────────────────────────────────────────────────── -->
<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Suppliers</p>
      <p class="text-xs text-[var(--text-3)]">
        Manage your product sources and payment terms
      </p>
    </div>
    <Button size="sm" onclick={openAdd}>
      <Plus size={14} strokeWidth={2} /> Add supplier
    </Button>
  </div>

  {#if loading}
    <div class="flex flex-col gap-2">
      {#each Array(4) as _}
        <div class="card p-4 flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-lg bg-[var(--surface2)] animate-pulse flex-shrink-0"
          ></div>
          <div class="flex-1 flex flex-col gap-1.5">
            <div
              class="h-3 bg-[var(--surface2)] rounded animate-pulse w-40"
            ></div>
            <div
              class="h-2.5 bg-[var(--surface2)] rounded animate-pulse w-24"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if suppliers.length === 0}
    <EmptyState
      icon="Truck"
      title="No suppliers yet"
      message="Add your first supplier to start tracking purchase orders and costs."
    >
      {#snippet action()}
        <Button size="sm" onclick={openAdd}
          ><Plus size={14} strokeWidth={2} /> Add supplier</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    <!-- Desktop table -->
    <div class="card overflow-hidden hidden md:block">
      <table class="tbl">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Contact</th>
            <th>Payment</th>
            <th>Lead time</th>
            <th>Currency</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each suppliers as s}
            <tr>
              <td>
                <div class="flex items-center gap-2.5">
                  <div
                    class="w-8 h-8 rounded-lg bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0"
                  >
                    <Truck
                      size={14}
                      style="color:var(--primary)"
                      strokeWidth={1.75}
                    />
                  </div>
                  <div>
                    <p class="text-xs font-semibold">{s.name}</p>
                    <p class="text-[10px] text-[var(--text-3)]">
                      {s.email || "—"}
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <p class="text-xs">{s.contact_name || "—"}</p>
                <p class="text-[10px] text-[var(--text-3)]">{s.phone || "—"}</p>
              </td>
              <td
                ><span class="badge badge-neutral text-[10px]"
                  >{TERM_LABELS[s.payment_terms] ?? s.payment_terms}</span
                ></td
              >
              <td class="text-xs text-[var(--text-2)]"
                >{s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}</td
              >
              <td class="text-xs text-[var(--text-2)]">{s.currency_code}</td>
              <td>
                <div class="flex items-center gap-1 justify-end">
                  <button
                    class="btn btn-ghost btn-icon btn-sm"
                    onclick={() => openEdit(s)}
                    title="Edit"
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                  </button>
                  <button
                    class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]"
                    onclick={() => {
                      deleteTarget = s;
                      showDelete = true;
                    }}
                    title="Deactivate"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile cards -->
    <div class="flex flex-col gap-3 md:hidden">
      {#each suppliers as s}
        <div class="card p-4 flex items-start gap-3">
          <div
            class="w-9 h-9 rounded-lg bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0 mt-0.5"
          >
            <Truck size={15} style="color:var(--primary)" strokeWidth={1.75} />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold truncate">{s.name}</p>
            <p class="text-[10px] text-[var(--text-3)] mt-0.5">
              {s.contact_name || ""}{s.contact_name && s.phone
                ? " · "
                : ""}{s.phone || ""}
            </p>
            <div class="flex items-center gap-2 mt-2">
              <span class="badge badge-neutral text-[9px]"
                >{TERM_LABELS[s.payment_terms] ?? s.payment_terms}</span
              >
              {#if s.lead_time_days != null}
                <span class="text-[10px] text-[var(--text-3)]"
                  >{s.lead_time_days}d lead time</span
                >
              {/if}
            </div>
          </div>
          <div class="flex gap-1 flex-shrink-0">
            <button
              class="btn btn-ghost btn-icon btn-sm"
              onclick={() => openEdit(s)}
            >
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <button
              class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]"
              onclick={() => {
                deleteTarget = s;
                showDelete = true;
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</PageShell>

<!-- ─── Modals rendered OUTSIDE <PageShell> to escape the fade-up stacking context ─── -->

<Modal
  bind:open={showAdd}
  title={editingSupplier ? "Edit supplier" : "Add supplier"}
  maxWidth="max-w-lg"
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      saveSupplier();
    }}
    class="flex flex-col gap-4"
  >
    <Input label="Company name" bind:value={form.name} required />
    <div class="grid grid-cols-2 gap-3">
      <Input label="Contact person" bind:value={form.contact_name} />
      <Input label="Phone" bind:value={form.phone} type="tel" />
    </div>
    <Input label="Email" bind:value={form.email} type="email" />
    <div class="input-group">
      <label class="input-label">Address</label>
      <textarea
        bind:value={form.address}
        class="input"
        rows="2"
        placeholder="Delivery / billing address"
      ></textarea>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Select
        label="Payment terms"
        bind:value={form.payment_terms}
        options={PAYMENT_TERMS}
      />
      <Input
        label="Currency code"
        bind:value={form.currency_code}
        placeholder="USD"
        hint="e.g. USD, NGN, GBP"
      />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Input
        label="Lead time (days)"
        bind:value={form.lead_time_days}
        type="number"
        hint="Avg days from order to delivery"
      />
      <div></div>
    </div>
    <div class="input-group">
      <label class="input-label">Internal notes</label>
      <textarea
        bind:value={form.notes}
        class="input"
        rows="2"
        placeholder="e.g. Minimum order ₦50,000"
      ></textarea>
    </div>
  </form>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => (showAdd = false)}
        >Cancel</Button
      >
      <Button loading={saving} onclick={saveSupplier}>
        {editingSupplier ? "Save changes" : "Add supplier"}
      </Button>
    </div>
  {/snippet}
</Modal>

<ConfirmModal
  bind:open={showDelete}
  title="Deactivate supplier"
  message="Deactivate {deleteTarget?.name}? Existing purchase orders are preserved."
  danger
  onconfirm={doDelete}
  oncancel={() => {
    showDelete = false;
    deleteTarget = null;
  }}
/>
