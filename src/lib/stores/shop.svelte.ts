import type { RecordModel } from 'pocketbase';
import { setFormatLocale } from '$lib/utils/format';

class ShopStore {
  #data = $state<RecordModel | null>(null);

  get data() { return this.#data; }

  get currency()    { return this.#data?.currency_code    ?? 'USD'; }
  get currencySymbol() { return this.#data?.currency_symbol ?? '$'; }
  get timezone()    { return this.#data?.timezone         ?? 'UTC'; }
  get theme()       { return this.#data?.theme            ?? 'system'; }
  get primaryColor(){ return this.#data?.primary_color    ?? '#7B4F8A'; }
  get sidebarBg()   { return this.#data?.sidebar_bg       ?? '#150F1C'; }
  get taxRate()     { return this.#data?.tax_rate         ?? 0; }
  get taxInclusive(){ return this.#data?.tax_inclusive     ?? false; }
  get taxName()     { return this.#data?.tax_name          ?? 'Tax'; }

  init(shop: RecordModel | null) {
    this.#data = shop;
    if (shop) {
      setFormatLocale({
        timezone:   shop.timezone   ?? 'UTC',
        currency:   shop.currency_code   ?? 'USD',
        locale:     shop.currency_locale ?? 'en-US',
        dateFormat: shop.date_format ?? 'D MMM YYYY',
        timeFormat: shop.time_format ?? '12h',
      });
    }
  }

  update(data: Partial<RecordModel>) {
    if (this.#data) {
      this.#data = { ...this.#data, ...data };
    }
  }
}

export const currentShop = new ShopStore();
