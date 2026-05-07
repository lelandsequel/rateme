/**
 * POST /api/me/avatar
 *
 * Uploads an avatar image for the authenticated user to Supabase Storage
 * (`avatars` bucket), then writes the public URL onto User.avatarUrl.
 *
 * Body:   multipart/form-data with field `file`
 * Auth:   required (cookie session OR mobile Bearer)
 * Mock:   HAS_DB=false → 503
 *
 * Validation:
 *   - file present
 *   - size <= 2MB
 *   - content-type in image/png, image/jpeg, image/webp
 *
 * Path scheme: `users/{userId}/{uuid}.{ext}` — one file per upload, never
 * overwritten (User.avatarUrl points to the latest). This leaves orphans
 * in the bucket; cleanup is a future cron concern.
 *
 * Returns: { avatarUrl: string }
 */

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { extensionForMime, uploadAvatar } from "@/lib/storage";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireSession();
    const userId = session.user.id;

    if (!HAS_DB) {
      return Response.json(
        { error: "no DB; avatar upload requires backend" },
        { status: 503 },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json(
        { error: "Invalid multipart/form-data body" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return Response.json(
        { error: "file field is required" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return Response.json(
        { error: `file exceeds 2MB limit (${file.size} bytes)` },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return Response.json({ error: "file is empty" }, { status: 400 });
    }

    const mime = file.type;
    if (!ALLOWED_MIMES.has(mime)) {
      return Response.json(
        {
          error: `Unsupported content-type "${mime}"; expected image/png, image/jpeg, or image/webp`,
        },
        { status: 400 },
      );
    }

    const ext = extensionForMime(mime);
    if (!ext) {
      // Belt + suspenders — extensionForMime mirrors the allow-list above.
      return Response.json({ error: "Unsupported content-type" }, { status: 400 });
    }

    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
      .replace(/-/g, "");
    const path = `users/${userId}/${id}.${ext}`;

    const buffer = await file.arrayBuffer();
    const result = await uploadAvatar(path, buffer, mime);
    if ("error" in result) {
      // Missing config is a 503 (not the user's fault); other failures 502.
      const status = result.missingConfig ? 503 : 502;
      return Response.json({ error: result.error }, { status });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: result.publicUrl },
    });

    return { avatarUrl: result.publicUrl };
  });
}
