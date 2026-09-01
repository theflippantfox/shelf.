/**
 * Shared zod schemas for the auth + onboarding flows.
 *
 * Used by both:
 *   - API handlers (src/routes/api/**)  — for server-side validation
 *   - Auth/onboarding pages (.svelte)   — for client-side inline validation
 *
 * Keep these pure (no Svelte imports) so they can run in either environment.
 */
import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Email is case-insensitive at the storage layer (Supabase lowercases). */
const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

/** Supabase Auth requires passwords ≥ 6, but we enforce 8+ for a better floor. */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long (max 72)');

const slugSchema = z
  .string()
  .trim()
  .min(2, 'Handle must be at least 2 characters')
  .max(40, 'Handle is too long')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers, and hyphens only (no leading/trailing hyphen)');

const nonEmptyString = (max = 100) =>
  z.string().trim().min(1, 'Required').max(max, `Must be at most ${max} characters`);

const optString = (max = 500) =>
  z.string().trim().max(max, `Must be at most ${max} characters`).optional().or(z.literal('')).transform((v) => (v ? v : undefined));

// ─── Auth schemas ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});

export const registerSchema = z.object({
  first_name: nonEmptyString(50),
  last_name:  optString(50),
  email:      emailSchema,
  password:   passwordSchema,
  confirm:    z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path:    ['confirm'],
});

/**
 * API-level schema (no `confirm` field — confirmation is a UI concern,
 * the API trusts the form to have already verified the match).
 */
export const registerApiSchema = z.object({
  first_name: nonEmptyString(50),
  last_name:  optString(50),
  email:      emailSchema,
  password:   passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirm:  z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path:    ['confirm'],
});

// ─── Onboarding schemas ────────────────────────────────────────────────────

export const shopSchema = z.object({
  name: nonEmptyString(80),
  slug: slugSchema,
});

export const localeSchema = z.object({
  country_code:    z.string().trim().length(2, 'Pick a country'),
  timezone:        z.string().trim().min(1, 'Pick a timezone'),
  currency_code:   z.string().trim().length(3, 'Pick a currency'),
  currency_symbol: z.string().min(1).max(8),
  currency_locale: z.string().min(1).max(20),
  date_format:     z.enum(['D MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('D MMM YYYY'),
  time_format:     z.enum(['12h', '24h']).default('12h'),
});

export const appearanceSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Pick a palette'),
  sidebar_bg:    z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Pick a palette'),
  theme:         z.enum(['light', 'dark', 'system']).default('system'),
  palette_id:    z.string().trim().max(64).optional(),
});

const inviteSchema = z.object({
  first_name: nonEmptyString(50),
  email:      emailSchema,
  password:   passwordSchema,
  role:       z.enum(['manager', 'cashier']),
});

export const teamSchema = z.object({
  invites: z.array(inviteSchema).default([]),
});

const categorySchema = z.object({
  name:  nonEmptyString(50),
  icon:  z.string().trim().min(1, 'Pick an icon'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Pick a color'),
});

export const categoriesSchema = z.object({
  categories: z.array(categorySchema).min(0).max(50),
});

// ─── Inferred types ────────────────────────────────────────────────────────

export type LoginInput    = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ShopInput     = z.infer<typeof shopSchema>;
export type LocaleInput   = z.infer<typeof localeSchema>;
export type AppearanceInput = z.infer<typeof appearanceSchema>;
export type TeamInput     = z.infer<typeof teamSchema>;
export type CategoriesInput = z.infer<typeof categoriesSchema>;

// ─── Field-error helper ────────────────────────────────────────────────────

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Run a zod schema against a value and return a flat
 * `{ field: errorMessage }` map (first error per field).
 *
 * Use on the client for inline field-level validation.
 * On the server, prefer the original `result.error` so the
 * API can also return 400 with structured details.
 */
export function flattenZodErrors<T>(result: z.ZodSafeParseResult<T>): FieldErrors<T> {
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) out[key] = issue.message;
  }
  return out as FieldErrors<T>;
}

/**
 * Validate a single field on the client. Returns the error
 * message or empty string. Useful for live `oninput` validation.
 */
export function validateField<T extends z.ZodTypeAny>(
  schema: T,
  field: keyof z.infer<T>,
  form: Partial<z.infer<T>>,
): string {
  // Use the schema's shape to pick the field's own validator
  const shape = (schema as any)._def?.shape?.();
  if (!shape || !(field in shape)) return '';
  const fieldSchema = shape[field];
  const result = fieldSchema.safeParse((form as any)[field]);
  if (result.success) return '';
  return result.error.issues[0]?.message ?? '';
}
