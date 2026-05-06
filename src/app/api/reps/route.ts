// GET /api/reps — search and filter the rep directory.
//
// Query params:
//   q          — case-insensitive substring on name or company
//   industry   — industry slug
//   state      — 2-letter US state code
//   limit      — default 50, max 100
//   offset     — default 0
//
// Auth required (any role). Per spec, "All Rep information is visible" so
// no redaction. We return enough fields for a results card; the detail
// page hits /api/reps/:id for ratings + aggregates.

import { Prisma, Role, USState } from "@prisma/client";

import { handle, parseIntParam } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      role: Role.REP,
      ...(state ? { state } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { repProfile: { company: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(industrySlug
        ? { repProfile: { industry: { slug: industrySlug } } }
        : {}),
    };

    const [reps, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          state: true,
          avatarUrl: true,
          repProfile: {
            select: {
              title: true,
              company: true,
              metroArea: true,
              industry: { select: { slug: true, name: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      reps: reps
        .filter((r) => r.repProfile !== null)
        .map((r) => ({
          id: r.id,
          name: r.name,
          state: r.state,
          avatarUrl: r.avatarUrl,
          title: r.repProfile!.title,
          company: r.repProfile!.company,
          metroArea: r.repProfile!.metroArea,
          industry: r.repProfile!.industry,
        })),
      total,
      limit,
      offset,
    };
  });
}
