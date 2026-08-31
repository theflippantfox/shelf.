/**
 * /api/storage/upload — generic file upload endpoint.
 *
 * body (multipart): file, bucket, kind
 *   bucket: 'product-images' | 'avatars' | 'bills'
 *   kind:   'product' | 'avatar' | 'bill'
 *   meta:   { saleRef?: string } (JSON string, for bill uploads)
 *
 * Returns: { path, signedUrl, size, mimeType }
 */
import { json } from '@sveltejs/kit';
import { uploadFile, paths, type Bucket } from '$lib/server/storage';

const ALLOWED_BUCKETS = new Set<Bucket>(['product-images', 'avatars', 'bills']);

export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) return json({ error: 'Not authenticated' }, { status: 401 });
  if (!locals.currentShop)
    return json({ error: 'No shop context' }, { status: 401 });

  const form = await request.formData();
  const file  = form.get('file');
  const bucket = String(form.get('bucket') ?? '');
  const kind   = String(form.get('kind')   ?? '');
  const metaRaw = form.get('meta');

  if (!(file instanceof File))
    return json({ error: 'file is required' }, { status: 400 });
  if (!ALLOWED_BUCKETS.has(bucket as Bucket))
    return json({ error: 'Invalid bucket' }, { status: 400 });

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  let path: string;

  if (kind === 'product') {
    path = paths.productImage(locals.currentShop.id, filename);
  } else if (kind === 'avatar') {
    path = paths.avatar(locals.user.id, filename);
  } else if (kind === 'bill') {
    const meta = metaRaw ? JSON.parse(String(metaRaw)) : {};
    const saleRef = meta.saleRef ?? 'unsorted';
    path = paths.bill(locals.currentShop.id, saleRef, filename);
  } else {
    return json({ error: 'Invalid kind' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadFile(bucket as Bucket, path, bytes, file.type);
  return json(result);
}