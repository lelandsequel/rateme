// PATCH /api/me/locale — set the authenticated user's UI locale.
//
// Body: { locale: "en" | "es" | "pt" }
// Returns: the updated user (same serialized shape as GET /api/me).
//
// Mobile uses this to remember the rater's language pick across logins.

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";

const ALLOWED_LOCALES = new Set(["en", "es", "pt"]);

interface PatchBody {
  locale?: unknown;
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    if (!HAS_DB) {
      return Response.json(
        { error: "no DB; locale change requires backend" },
        { status: 503 },
      );
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const locale = typeof body.locale === "string" ? body.locale : null;
    if (!locale || !ALLOWED_LOCALES.has(locale)) {
      return Response.json(
        { error: `locale must be one of: ${[...ALLOWED_LOCALES].join(", ")}` },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { locale },
    });

    const updated = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        repProfile: { include: { industry: { select: { slug: true, name: true } } } },
        raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
        managerProfile: true,
      },
    });
    if (!updated) {
      return Response.json({ error: "User no longer exists" }, { status: 404 });
    }
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      state: updated.state,
      avatarUrl: updated.avatarUrl,
      locale: updated.locale,
      createdAt: updated.createdAt,
      repProfile: updated.repProfile
        ? {
            title: updated.repProfile.title,
            company: updated.repProfile.company,
            metroArea: updated.repProfile.metroArea,
            industry: updated.repProfile.industry,
          }
        : null,
      raterProfile: updated.raterProfile
        ? {
            title: updated.raterProfile.title,
            company: updated.raterProfile.company,
            industry: updated.raterProfile.industry,
          }
        : null,
      managerProfile: updated.managerProfile
        ? {
            managesType: updated.managerProfile.managesType,
            company: updated.managerProfile.company,
          }
        : null,
    };
  });
}

export const dynamic = "force-dynamic";
