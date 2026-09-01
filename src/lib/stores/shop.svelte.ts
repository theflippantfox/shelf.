
import { setFormatLocale } from '$lib/utils/format';

class ShopStore {
  #data = $state<any | null>(null);

  get data() { return this.#data; }

  get currency()    { return this.#data?.currency_code    ?? 'INR'; }
  get currencySymbol() { return this.#data?.currency_symbol ?? '₹'; }
  get timezone()    { return this.#data?.timezone         ?? 'UTC'; }
  get theme()       { return this.#data?.theme            ?? 'system'; }
  get primaryColor(){ return this.#data?.primary_color    ?? '#0B0B0F'; }
  get sidebarBg()   { return this.#data?.sidebar_bg       ?? '#0B0B0F'; }
  get taxRate()     { return this.#data?.tax_rate         ?? 0; }
  get taxInclusive(){ return this.#data?.tax_inclusive     ?? false; }
  get taxName()     { return this.#data?.tax_name          ?? 'Tax'; }

  init(shop: any | null) {
    this.#data = shop;
    if (shop) {
      setFormatLocale({
        timezone:   shop.timezone   ?? 'UTC',
        currency:   shop.currency_code   ?? 'INR',
        locale:     shop.currency_locale ?? 'en-IN',
        dateFormat: shop.date_format ?? 'D MMM YYYY',
        timeFormat: shop.time_format ?? '12h',
      });
    }
  }

  update(data: Partial<any>) {
    if (this.#data) {
      this.#data = { ...this.#data, ...data };
    }
  }
}

export const currentShop = new ShopStore();
