
import { setFormatLocale } from '$lib/utils/format';

export interface UserShop {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'manager' | 'cashier';
  status: 'active' | 'invited' | 'suspended';
  currency_symbol?: string;
  currency_code?: string;
}

class ShopStore {
  #data = $state<any | null>(null);
  /** All shops the current user is a member of. Active and invited. */
  #allShops = $state<UserShop[]>([]);

  get data() { return this.#data; }
  get allShops() { return this.#allShops; }
  get activeShops()  { return this.#allShops.filter((s) => s.status === 'active'); }
  get pendingInvites() { return this.#allShops.filter((s) => s.status === 'invited'); }
  get pendingInviteCount() { return this.pendingInvites.length; }

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

  /** Replace the user's full shop list. Called on app load + after
   *  invite accept/decline so the switcher stays in sync. */
  setAllShops(shops: UserShop[]) {
    this.#allShops = shops;
  }

  /**
   * Switch the active shop. Sets the cookie, updates the active shop data,
   * and reloads server data. Returns the new shop on success.
   */
  async switchTo(shopId: string) {
    if (!shopId || shopId === this.#data?.id) return;
    const res = await fetch('/api/auth/select-shop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId }),
    });
    if (!res.ok) throw new Error('Failed to switch shop');
    // Update active data optimistically; the page navigation that follows
    // will re-run the (app) layout's load() with the new locals.
    this.#data = { ...(this.#data ?? {}), id: shopId };
  }

  update(data: Partial<any>) {
    if (this.#data) {
      this.#data = { ...this.#data, ...data };
    }
  }
}

export const currentShop = new ShopStore();
