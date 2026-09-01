<script lang="ts">
  import { goto }  from '$app/navigation';
  import Input     from '$lib/components/ui/Input.svelte';
  import PasswordInput from '$lib/components/ui/PasswordInput.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import { Plus, Trash2, Users, UserPlus } from 'lucide-svelte';
  import { teamSchema, type FieldErrors } from '$lib/validators';

  interface Invite { first_name: string; email: string; password: string; role: 'manager' | 'cashier' }

  let invites = $state<Invite[]>([]);
  let formError = $state('');
  let fieldErrors: Record<number, { first_name?: string; email?: string; password?: string }> = $state({});
  let loading = $state(false);

  const roleOptions = [
    { value: 'cashier', label: 'Cashier — can create sales only' },
    { value: 'manager', label: 'Manager — can void sales, manage inventory' },
  ];

  function addRow() {
    invites = [...invites, { first_name: '', email: '', password: '', role: 'cashier' }];
  }

  function removeRow(i: number) {
    invites = invites.filter((_, idx) => idx !== i);
    const { [i]: _drop, ...rest } = fieldErrors;
    fieldErrors = rest;
  }

  function clearRowField(i: number, field: 'first_name' | 'email' | 'password') {
    if (fieldErrors[i]?.[field]) {
      fieldErrors = { ...fieldErrors, [i]: { ...fieldErrors[i], [field]: undefined } };
    }
  }

  async function next() {
    formError = '';
    // Only validate non-empty rows
    const valid = invites.filter(i => i.first_name.trim() || i.email.trim() || i.password);
    const parsed = teamSchema.safeParse({ invites: valid });
    if (!parsed.success) {
      const byIdx: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const idx = issue.path[0] === 'invites' ? Number(issue.path[1]) : -1;
        const field = issue.path[2] as 'first_name' | 'email' | 'password' | undefined;
        if (idx >= 0 && field) {
          byIdx[idx] = { ...byIdx[idx], [field]: issue.message };
        }
      }
      fieldErrors = byIdx;
      return;
    }

    loading = true;
    try {
      if (parsed.data.invites.length > 0) {
        const res = await fetch('/api/onboarding/team', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        const data = await res.json();
        if (!res.ok) {
          formError = data.error ?? 'Failed to create team members';
          loading = false;
          return;
        }
      }
      goto('/onboarding/categories');
    } catch {
      formError = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Your team · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Add your team</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">
    Optional — you can always add staff later in Settings → Team.
  </p>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-lg p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  {#if invites.length === 0}
    <div class="flex flex-col items-center py-8 text-center mb-4 surface-card-flat">
      <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
           style="background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary);">
        <Users size={20} strokeWidth={1.75} />
      </div>
      <p class="text-[13px] font-semibold text-[var(--text)]">No team members yet</p>
      <p class="text-[12px] text-[var(--text-3)] mt-1 max-w-[260px]">
        You can add cashiers and managers so your team can sign in and use the system.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3 mb-4">
      {#each invites as invite, i (i)}
        <div class="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-[var(--text-2)] inline-flex items-center gap-1.5">
              <UserPlus size={11} strokeWidth={2} />
              Team member {i + 1}
            </p>
            <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]" onclick={() => removeRow(i)} aria-label="Remove team member">
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Input
              label="First name"
              bind:value={invite.first_name}
              required
              oninput={() => clearRowField(i, 'first_name')}
              error={fieldErrors[i]?.first_name}
            />
            <Select label="Role" bind:value={invite.role} options={roleOptions} />
          </div>
          <Input
            label="Email"
            type="email"
            bind:value={invite.email}
            required
            oninput={() => clearRowField(i, 'email')}
            error={fieldErrors[i]?.email}
          />
          <PasswordInput
            label="Password"
            bind:value={invite.password}
            hint="At least 8 characters. Staff can change it after first login."
            required
            autocomplete="new-password"
            oninput={() => clearRowField(i, 'password')}
            error={fieldErrors[i]?.password}
          />
        </div>
      {/each}
    </div>
  {/if}

  <button class="btn btn-secondary btn-sm w-full justify-center mb-5" onclick={addRow} type="button">
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
