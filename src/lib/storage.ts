/**
 * Supabase Storage REST client.
 *
 * Why hand-rolled fetch instead of `@supabase/supabase-js`? The whole rest
 * of the codebase talks to Supabase Postgres via Prisma — we never pulled in
 * the JS client. For a single bucket upload it's lighter to hit the REST
 * endpoint directly than to add another dependency.
 *
 * Endpoint reference:
 *   POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
 *   Authorization: Bearer {SERVICE_ROLE_KEY}
 *   Content-Type: <file mime>
 *   x-upsert: true   (overwrite on path collision — we use unique paths so
 *                     this only matters in retries)
 *
 * Public read URL (bucket must be set to public):
 *   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 *
 * IMPORTANT: SUPABASE_SERVICE_ROLE_KEY is server-only. Never reference it
 * client-side, never prefix with NEXT_PUBLIC_.
 */

const AVATAR_BUCKET = "avatars";

export interface UploadResult {
  /** Public URL for the uploaded object. */
  publicUrl: string;
  /** Storage path within the bucket (e.g. `users/abc/123.png`). */
  path: string;
}

export interface UploadError {
  /** Human-readable error string. */
  error: string;
  /** True if the failure is due to missing env config (vs network/storage). */
  missingConfig?: boolean;
}

/**
 * Upload a file to the `avatars` bucket. Soft-fails (returns an error
 * object) when env config is missing so the build still works without the
 * keys configured.
 */
export async function uploadAvatar(
  path: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<UploadResult | UploadError> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      error:
        "Avatar upload is not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and create the `avatars` bucket.",
      missingConfig: true,
    };
  }

  const endpoint = `${url}/storage/v1/object/${AVATAR_BUCKET}/${path}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: body as BodyInit,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      detail = j.error ?? j.message ?? "";
    } catch {
      // body wasn't JSON — fall through with empty detail
    }
    return {
      error: `Upload failed (${res.status})${detail ? `: ${detail}` : ""}`,
    };
  }

  return {
    publicUrl: `${url}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`,
    path,
  };
}

/** Pick a file extension from a mime type (limited to the allow-list). */
export function extensionForMime(mime: string): string | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}
