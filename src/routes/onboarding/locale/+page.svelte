<script lang="ts">
  import { goto } from '$app/navigation';
  import { COUNTRIES } from '$lib/config/countries';
  import { TIMEZONES } from '$lib/config/timezones';
  import { CURRENCIES } from '$lib/config/currencies';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let country  = $state('NG');
  let timezone = $state('Africa/Lagos');
  let currency = $state('NGN');
  let loading  = $state(false);

  // Auto-fill from country selection
  function onCountryChange(code: string) {
    const c = COUNTRIES.find(x => x.code === code);
    if (c) { timezone = c.timezone; currency = c.currency; }
  }

  async function next() {
    loading = true;
    const cur = CURRENCIES.find(c => c.code === currency)!;
    await fetch('/api/onboarding/locale', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country_code:    country,
        timezone,
        currency_code:   currency,
        currency_symbol: cur?.symbol ?? currency,
        currency_locale: cur?.locale ?? 'en-US',
      }),
    });
    goto('/onboarding/appearance');
    loading = false;
  }

  const countryOpts  = COUNTRIES.map(c  => ({ value: c.code,  label: c.name }));
  const timezoneOpts = TIMEZONES.map(tz => ({ value: tz.iana,  label: `${tz.display} (${tz.offset})` }));
  const currencyOpts = CURRENCIES.map(c  => ({ value: c.code,  label: `${c.code} — ${c.name}` }));
</script>

<svelte:head><title>Location & Currency · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Where is your shop?</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">Sets your currency and timezone.</p>
  <form onsubmit={(e) => { e.preventDefault(); next(); }} class="flex flex-col gap-4">
    <Select label="Country"  bind:value={country}  options={countryOpts}  onchange={onCountryChange} />
    <Select label="Timezone" bind:value={timezone} options={timezoneOpts} />
    <Select label="Currency" bind:value={currency} options={currencyOpts} />
    <Button type="submit" {loading} class="w-full justify-center">Continue →</Button>
  </form>
</div>
