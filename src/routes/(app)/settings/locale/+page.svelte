<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }    from '$lib/stores/toast.svelte';
  import { COUNTRIES } from '$lib/config/countries';
  import { TIMEZONES } from '$lib/config/timezones';
  import { CURRENCIES, getCurrency } from '$lib/config/currencies';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import { ArrowLeft } from 'lucide-svelte';

  let { data } = $props();
  const shop = data.shop as any;

  let timezone    = $state(shop.timezone      ?? 'UTC');
  let currency    = $state(shop.currency_code ?? 'USD');
  let date_format = $state(shop.date_format   ?? 'D MMM YYYY');
  let time_format = $state(shop.time_format   ?? '12h');
  let saving      = $state(false);

  const tzOptions  = TIMEZONES.map(t => ({ value: t.iana, label: `${t.display} (${t.offset})` }));
  const curOptions = CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.name} (${c.symbol})` }));
  const dateOptions = [
    { value: 'D MMM YYYY',  label: 'D MMM YYYY  — e.g. 5 Jun 2025' },
    { value: 'DD/MM/YYYY',  label: 'DD/MM/YYYY  — e.g. 05/06/2025' },
    { value: 'MM/DD/YYYY',  label: 'MM/DD/YYYY  — e.g. 06/05/2025' },
    { value: 'YYYY-MM-DD',  label: 'YYYY-MM-DD  — e.g. 2025-06-05' },
  ];
  const timeOptions = [
    { value: '12h', label: '12-hour (3:30 PM)' },
    { value: '24h', label: '24-hour (15:30)'   },
  ];

  async function save() {
    saving = true;
    const cur = getCurrency(currency)!;
    const res = await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone, date_format, time_format,
        currency_code:   currency,
        currency_symbol: cur.symbol,
        currency_locale: cur.locale,
      }),
    });
    if (res.ok) { toasts.success('Locale settings saved'); await invalidateAll(); }
    else toasts.error('Failed to save');
    saving = false;
  }
</script>

<svelte:head><title>Locale · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <p class="font-semibold text-sm">Locale</p>
  </div>
  <div class="card p-5 flex flex-col gap-4 max-w-lg">
    <Select label="Currency"    bind:value={currency}    options={curOptions}  />
    <Select label="Timezone"    bind:value={timezone}    options={tzOptions}   />
    <Select label="Date format" bind:value={date_format} options={dateOptions} />
    <Select label="Time format" bind:value={time_format} options={timeOptions} />
    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save changes</Button>
    </div>
  </div>
</PageShell>
