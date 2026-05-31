<script lang="ts">
  import { goto }  from '$app/navigation';
  import Input     from '$lib/components/ui/Input.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import { Plus, Trash2, Users } from 'lucide-svelte';

  interface Invite { first_name: string; email: string; password: string; role: string }

  let invites = $state<Invite[]>([]);
  let loading = $state(false);
  let error   = $state('');

  const roleOptions = [
    { value: 'manager', label: 'Manager — can void sales, manage inventory' },
    { value: 'cashier', label: 'Cashier  — can create sales only' },
  ];

  function addRow() {
    invites = [...invites, { first_name: '', email: '', password: '', role: 'cashier' }];
  }

  function removeRow(i: number) {
    invites = invites.filter((_, idx) => idx !== i);
  }

  async function next() {
    error = ''; loading = true;
    try {
      const valid = invites.filter(i => i.email.trim() && i.first_name.trim() && i.password.length >= 8);
      if (valid.length > 0) {
        const res = await fetch('/api/onboarding/team', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invites: valid }),
        });
        const data = await res.json();
        if (!res.ok) { error = data.error ?? 'Failed to create team members'; loading = false; return; }
      }
      goto('/onboarding/categories');
    } catch { error = 'Network error'; }
    loading = false;
  }
</script>

<svelte:head><title>Your team · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Add your team</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">
    Optional — you can always add staff later in Settings → Team.
  </p>

  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-xs rounded-lg p-3 mb-4">{error}</div>
  {/if}

  {#if invites.length === 0}
    <div class="flex flex-col items-center py-6 text-center mb-4">
      <div class="w-10 h-10 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-2">
        <Users size={18} class="text-[var(--text-3)]" />
      </div>
      <p class="text-xs text-[var(--text-3)]">No team members yet.</p>
    </div>
  {:else}
    <div class="flex flex-col gap-4 mb-4">
      {#each invites as invite, i}
        <div class="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-[var(--text-2)]">Team member {i + 1}</p>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => removeRow(i)}>
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Input label="First name" bind:value={invite.first_name} required />
            <Select label="Role" bind:value={invite.role} options={roleOptions} />
          </div>
          <Input label="Email"    type="email"    bind:value={invite.email}    required />
          <Input label="Password" type="password" bind:value={invite.password}
                 hint="At least 8 characters. Staff can change it after first login." required />
        </div>
      {/each}
    </div>
  {/if}

  <button class="btn btn-secondary btn-sm w-full justify-center mb-5" onclick={addRow}>
    <Plus size={14} strokeWidth={2} /> Add team member
  </button>

  <div class="flex gap-2">
    <Button variant="secondary" href="/onboarding/appearance" class="flex-1 justify-center">
      Back
    </Button>
    <Button onclick={next} {loading} class="flex-1 justify-center">
      {invites.length === 0 ? 'Skip for now →' : `Add ${invites.length} member${invites.length > 1 ? 's' : ''} →`}
    </Button>
  </div>
</div>
