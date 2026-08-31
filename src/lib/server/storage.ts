/**
 * Storage helpers — Supabase Storage instead of Directus /assets/.
 *
 * All file access goes through the server using the service-role client.
 * Clients receive either a signed URL (private) or the public URL.
 *
 * Buckets:
 *   product-images/<shop_id>/<file>   — product photos
 *   avatars/<user_id>/<file>          — user profile photos
 *   bills/<shop_id>/<sale_ref>/<file> — bills/receipts attached to a sale
 */
import { adminClient } from './supabase';

export type Bucket = 'product-images' | 'avatars' | 'bills';

export interface UploadResult {
  path: string;
  signedUrl: string;
  size: number;
  mimeType: string;
}

const SIGNED_URL_TTL = 60 * 60; // 1 hour

/**
 * Upload a file to a bucket. Returns a signed URL (valid 1h) the client can
 * use to display the file. The URL is regenerated on demand elsewhere when
 * it expires.
 */
export async function uploadFile(
  bucket: Bucket,
  path: string,
  file: Uint8Array | Blob,
  contentType: string
): Promise<UploadResult> {
  const admin = adminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !data) throw new Error(`Sign URL failed: ${signErr?.message}`);

  return {
    path,
    signedUrl: data.signedUrl,
    size: (file as any).size ?? 0,
    mimeType: contentType,
  };
}

/**
 * Generate a fresh signed URL for an existing file.
 */
export async function getSignedUrl(bucket: Bucket, path: string): Promise<string | null> {
  const admin = adminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Delete a file. Caller is responsible for verifying ownership.
 */
export async function deleteFile(bucket: Bucket, path: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/**
 * Path builders — keep storage layout in one place.
 */
export const paths = {
  productImage: (shopId: string, filename: string) => `${shopId}/${filename}`,
  avatar:       (userId: string, filename: string) => `${userId}/${filename}`,
  bill:         (shopId: string, saleRef: string, filename: string) =>
    `${shopId}/${saleRef}/${filename}`,
};