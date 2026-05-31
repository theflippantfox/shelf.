import { toasts } from '$lib/stores/toast.svelte';

export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      toasts.error(data.error ?? 'Something went wrong');
      return null;
    }
    return data as T;
  } catch {
    toasts.error('Network error — check your connection');
    return null;
  }
}

export async function apiForm<T>(
  method: 'POST' | 'PATCH',
  path: string,
  formData: FormData
): Promise<T | null> {
  try {
    const res = await fetch(path, { method, body: formData });
    const data = await res.json();
    if (!res.ok) {
      toasts.error(data.error ?? 'Something went wrong');
      return null;
    }
    return data as T;
  } catch {
    toasts.error('Network error — check your connection');
    return null;
  }
}
