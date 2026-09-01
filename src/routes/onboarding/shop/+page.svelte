<script lang="ts">
  import { goto } from '$app/navigation';
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { shopSchema, type FieldErrors } from '$lib/validators';

  let name     = $state('');
  let slug     = $state('');
  let slugTouched = $state(false);
  let fieldErrors: FieldErrors<{ name: string; slug: string }> = $state({});
  let formError = $state('');
  let loading  = $state(false);

  // Auto-derive slug from name until the user types in the slug field
  $effect(() => {
    if (!slugTouched) {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
  });

  function onSlugInput(v: string) {
    slug = v;
    slugTouched = true;
    if (fieldErrors.slug) fieldErrors = { ...fieldErrors, slug: undefined };
  }

  async function next() {
    formError = '';
    fieldErrors = {};
    const parsed = shopSchema.safeParse({ name, slug });
    if (!parsed.success) {
      const flat: any = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0]; if (typeof k === 'string' && !flat[k]) flat[k] = i.message;
      }
      fieldErrors = flat;
      return;
    }
    loading = true;
    try {
      const res  = await fetch('/api/onboarding/shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) fieldErrors = data.fieldErrors;
        formError = data.error ?? 'Failed to create shop';
        return;
      }
      goto('/onboarding/locale');
    } catch {
      formError = 'Network error';
    } finally {
      loading = false;
    }
  }

  const slugPreview = $derived(slug ? `shelf.app/${slug}` : null);
</script>

<svelte:head><title>Your shop · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Name your shop</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">You can change this anytime in settings.</p>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-lg p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); next(); }} class="flex flex-col gap-4" novalidate>
    <Input
      label="Shop name"
      bind:value={name}
      placeholder="e.g. Glam Studio"
      required
      oninput={() => { if (fieldErrors.name) fieldErrors = { ...fieldErrors, name: undefined }; }}
      error={fieldErrors.name}
    />

    <div>
      <Input
        label="Shop handle"
        value={slug}
        oninput={(e: Event) => onSlugInput((e.currentTarget as HTMLInputElement).value)}
        placeholder="glam-studio"
        hint={slugPreview ? `Your shop will be at ${slugPreview}` : 'Used in your URL. Letters, numbers, and hyphens only.'}
        error={fieldErrors.slug}
      />
    </div>

    <div class="flex gap-2">
      <Button variant="secondary" href="/welcome" class="flex-1 justify-center">Back</Button>
      <Button type="submit" {loading} class="flex-1 justify-center">Continue →</Button>
    </div>
  </form>
</div>
