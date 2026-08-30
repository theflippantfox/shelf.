import type { Profile, Shop, ShopMember } from '$lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      user:        Profile | null;
      shopMember:  ShopMember | null;
      currentShop: Shop | null;
    }
    interface Error { message: string }
  }
}
export {};