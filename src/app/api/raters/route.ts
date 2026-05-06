// GET /api/raters — search the rater directory (REDACTED).
//
// Privacy: NEVER returns name or email. Only userId, title, company,
// industry, state. The userId is required so callers can request a
// connection by id, but identity is otherwise anonymous.
//
// Query params: q (matches against title or company — NOT name),
//               industry (slug), state (2-letter), limit, offset.

import { Prisma, Role, USState } from "@prisma/client";

import { handle, parseIntParam } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRater } from "@/lib/redact";

export async function GET(req: Request) {
  return handle(async () => {
    await requireSession();

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || null;
    const industrySlug = url.searchParams.get("industry") || null;
    const stateRaw = url.searchParams.get("state")?.toUpperCase() || null;
    const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 100);
    const offset = parseIntParam(url.searchParams.get("offset"), 0, 0, 10_000);

    const state =
      stateRaw && (Object.values(USState) as string[]).includes(stateRaw)
        ? (stateRaw as USState)
        : null;

    const where: Prisma.UserWhereInput = {
      role: Role.RATER,
      ...(state ? { state } : {}),
      ...(q
        ? {
            raterProfile: {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
      ...(industrySlug
        ? { raterProfile: { industry: { slug: industrySlug } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.raterProfile.findMany({
        where: { user: where },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true, state: true, createdAt: true } },
          industry: { select: { slug: true, name: true } },
        },
        orderBy: { user: { createdAt: "desc" } },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      raters: rows.map((r) =>
        publicRater({
          userId: r.userId,
          user: r.user,
          title: r.title,
          company: r.company,
          industry: r.industry,
        }),
      ),
      total,
      limit,
      offset,
    };
  });
}
