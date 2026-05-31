import type { DirectusRestClient } from '$lib/server/directus';
import type { User, Shop, ShopMember } from '$lib/types/directus';

declare global {
  namespace App {
    interface Locals {
      directus:    DirectusRestClient | null;
      user:        Omit<User, 'password_hash'> | null;
      shopMember:  ShopMember | null;
      currentShop: Shop | null;
    }
    interface Error { message: string }
  }
}
export {};
