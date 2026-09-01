<script lang="ts">
  import { goto } from '$app/navigation';
  import { COUNTRIES } from '$lib/config/countries';
  import { TIMEZONES } from '$lib/config/timezones';
  import { CURRENCIES } from '$lib/config/currencies';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { localeSchema, type FieldErrors } from '$lib/validators';

  let country  = $state('IN');
  let timezone = $state('Asia/Kolkata');
  let currency = $state('INR');
  let date_format = $state<'D MMM YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'>('D MMM YYYY');
  let time_format = $state<'12h' | '24h'>('12h');
  let fieldErrors: FieldErrors<{ country_code: string; timezone: string; currency_code: string }> = $state({});
  let formError = $state('');
  let loading  = $state(false);

  // Auto-fill from country selection
  function onCountryChange(code: string) {
    country = code;
    const c = COUNTRIES.find(x => x.code === code);
    if (c) { timezone = c.timezone; currency = c.currency; }
  }

  const cur         = $derived(CURRENCIES.find(c => c.code === currency));
  const tz          = $derived(TIMEZONES.find(t => t.iana === timezone));
  const datePreview = $derived(
    date_format === 'YYYY-MM-DD'  ? '2026-09-01'  :
    date_format === 'DD/MM/YYYY' ? '01/09/2026'  :
    date_format === 'MM/DD/YYYY' ? '09/01/2026'  :
                                   '1 Sep 2026'
  );
  const timePreview = $derived(time_format === '24h' ? '14:30' : '2:30 PM');

  async function next() {
    formError = '';
    fieldErrors = {};
    const payload = {
      country_code: country,
      timezone,
      currency_code: currency,
      currency_symbol: cur?.symbol ?? currency,
      currency_locale: cur?.locale ?? 'en-IN',
      date_format,
      time_format,
    };
    const parsed = localeSchema.safeParse(payload);
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
      const res = await fetch('/api/onboarding/locale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        formError = data.error ?? 'Failed to save';
        return;
      }
      goto('/onboarding/appearance');
    } catch {
      formError = 'Network error';
    } finally {
      loading = false;
    }
  }

  const countryOpts  = COUNTRIES.map(c  => ({ value: c.code,  label: c.name }));
  const timezoneOpts = TIMEZONES.map(tz => ({ value: tz.iana,  label: `${tz.display} (${tz.offset})` }));
  const currencyOpts = CURRENCIES.map(c  => ({ value: c.code,  label: `${c.code} — ${c.name}` }));
  const dateOpts     = [
    { value: 'D MMM YYYY',   label: '1 Sep 2026'   },
    { value: 'DD/MM/YYYY',   label: '01/09/2026'   },
    { value: 'MM/DD/YYYY',   label: '09/01/2026'   },
    { value: 'YYYY-MM-DD',   label: '2026-09-01'   },
  ];
  const timeOpts     = [
    { value: '12h', label: '2:30 PM' },
    { value: '24h', label: '14:30'   },
  ];
</script>

<svelte:head><title>Location & Currency · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Where is your shop?</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">Sets your currency, timezone, and date format.</p>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-lg p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); next(); }} class="flex flex-col gap-4" novalidate>
    <Select label="Country"  bind:value={country}  options={countryOpts}  onchange={onCountryChange} />
    <Select label="Timezone" bind:value={timezone} options={timezoneOpts} />
    <Select label="Currency" bind:value={currency} options={currencyOpts} />

    <div class="grid grid-cols-2 gap-3">
      <Select label="Date format" bind:value={date_format} options={dateOpts} />
      <Select label="Time format" bind:value={time_format} options={timeOpts} />
    </div>

    <!-- Live preview -->
    <div class="rounded-xl p-3.5 border" style="background:var(--surface2); border-color:var(--border)">
      <p class="text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)] mb-2">Preview</p>
      <div class="space-y-1.5 text-[12.5px]">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[var(--text-3)]">Currency</span>
          <span class="font-mono font-semibold tabular-nums">
            <span style="color:var(--primary)">{cur?.symbol ?? currency}</span>1,234{cur?.code ? ' ' + cur.code : ''}
          </span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[var(--text-3)]">Timezone</span>
          <span class="font-semibold">{tz?.display ?? timezone} <span class="text-[var(--text-3)] font-normal">({tz?.offset ?? ''})</span></span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[var(--text-3)]">Date</span>
          <span class="font-mono">{datePreview}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[var(--text-3)]">Time</span>
          <span class="font-mono">{timePreview}</span>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <Button variant="secondary" href="/onboarding/shop" class="flex-1 justify-center">Back</Button>
      <Button type="submit" {loading} class="flex-1 justify-center">Continue →</Button>
    </div>
  </form>
</div>
