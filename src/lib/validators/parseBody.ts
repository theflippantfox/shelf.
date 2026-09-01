/**
 * Helper for SvelteKit API endpoints that use zod for body validation.
 *
 * Returns a 400 Response with `{ error, fieldErrors }` on validation failure,
 * or the parsed value on success. Keeps endpoint code uniform.
 *
 * Usage:
 *   const parsed = await parseBody(request, mySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const data = parsed.data;
 */
import { json } from '@sveltejs/kit';
import { z, type ZodTypeAny } from 'zod';

export type ParseResult<T> =
  | { ok: true;  data: T }
  | { ok: false; response: Response };

export async function parseBody<T extends ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      response: json(
        { error: 'Please check the highlighted fields', fieldErrors },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}
