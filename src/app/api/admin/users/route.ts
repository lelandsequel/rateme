// GET /api/admin/users — ADMIN-only listing of users with search + filter.
//
// Query params:
//   q       — substring (case-insensitive) match against name OR email
//   role    — filter by Role enum value
//   limit   — page size (default 50, max 200)
//   offset  — page offset (default 0)
//
// Returns: { users: [...], total }

import { Prisma, Role } from "@prisma/client";

import { handle, parseIntParam } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = new Set<string>(Object.values(Role));

export async function GET(req: Request) {
  return handle(async () => {
    await requireRole("ADMIN");

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const roleParam = url.searchParams.get("role")?.trim() ?? "";
    const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 200);
    const offset = parseIntParam(url.searchParams.get("offset"), 0, 0, 1_000_000);

    const where: Prisma.UserWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    if (roleParam && VALID_ROLES.has(roleParam)) {
      where.role = roleParam as Role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          state: true,
          createdAt: true,
          lastLoginAt: true,
          emailVerifiedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  });
}
