// GET /api/me — return the current user with their role-specific profile.
//
// Self-view, so includes everything (name, email, full profile fields).
// The redact layer is for the OUTSIDE world looking IN; /me is the
// authenticated user looking at themselves.
//
// PATCH /api/me — partial profile update for the authenticated user.
// Only the fields present in the body are updated. The User row + the
// matching profile child row are updated together in a transaction.

import { Prisma, Role, USState } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        repProfile: { include: { industry: { select: { slug: true, name: true } } } },
        raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
        managerProfile: true,
      },
    });
    if (!user) {
      return Response.json({ error: "User no longer exists" }, { status: 404 });
    }

    return serialize(user);
  });
}

const VALID_STATES = new Set<USState>(Object.values(USState));

interface PatchBody {
  name?: unknown;
  state?: unknown;
  title?: unknown;
  company?: unknown;
  industrySlug?: unknown;
  metroArea?: unknown;
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    const userId = session.user.id;
    const role = session.user.role as Role;

    if (!HAS_DB) {
      return Response.json({ error: "no DB; profile edit requires backend" }, { status: 503 });
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    // ----- Validate user-level fields -------------------------------------

    const userData: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") return badReq("name must be a string");
      const n = body.name.trim();
      if (n.length < 1 || n.length > 100) return badReq("name length must be 1-100");
      userData.name = n;
    }
    if (body.state !== undefined) {
      if (typeof body.state !== "string") return badReq("state must be a string");
      const s = body.state.toUpperCase();
      if (!VALID_STATES.has(s as USState)) return badReq("state must be a valid 2-letter US state code");
      userData.state = s as USState;
    }

    // ----- Validate role-level fields -------------------------------------
    //
    // Title / industry are valid for REP + RATER. Company is valid for
    // REP + RATER + MANAGER (sales/rater). MetroArea is REP-only.
    // Silently ignore fields that don't apply to the caller's role.

    const titleProvided = body.title !== undefined;
    const companyProvided = body.company !== undefined;
    const industryProvided = body.industrySlug !== undefined;
    const metroProvided = body.metroArea !== undefined;

    let title: string | null = null;
    let company: string | null = null;
    let industryId: string | null = null;
    let metroArea: string | null | undefined; // undefined = not provided; null = clear

    if (titleProvided) {
      if (typeof body.title !== "string") return badReq("title must be a string");
      const t = body.title.trim();
      if (t.length < 1 || t.length > 100) return badReq("title length must be 1-100");
      title = t;
    }
    if (companyProvided) {
      if (typeof body.company !== "string") return badReq("company must be a string");
      const c = body.company.trim();
      if (c.length < 1 || c.length > 100) return badReq("company length must be 1-100");
      company = c;
    }
    if (industryProvided) {
      if (typeof body.industrySlug !== "string") return badReq("industrySlug must be a string");
      const ind = await prisma.industry.findUnique({
        where: { slug: body.industrySlug },
      });
      if (!ind) return badReq(`industrySlug not recognized: ${body.industrySlug}`);
      industryId = ind.id;
    }
    if (metroProvided) {
      // Allow null or "" to clear; validate length when set.
      if (body.metroArea === null || body.metroArea === "") {
        metroArea = null;
      } else if (typeof body.metroArea === "string") {
        const m = body.metroArea.trim();
        if (m.length > 100) return badReq("metroArea length must be <= 100");
        metroArea = m.length === 0 ? null : m;
      } else {
        return badReq("metroArea must be a string or null");
      }
    }

    // ----- Build the role-specific profile update -------------------------

    const repUpdate: Prisma.RepProfileUpdateInput = {};
    const raterUpdate: Prisma.RaterProfileUpdateInput = {};
    const managerUpdate: Prisma.ManagerProfileUpdateInput = {};

    if (role === Role.REP) {
      if (titleProvided && title !== null) repUpdate.title = title;
      if (companyProvided && company !== null) repUpdate.company = company;
      if (industryProvided && industryId !== null) {
        repUpdate.industry = { connect: { id: industryId } };
      }
      if (metroProvided) repUpdate.metroArea = metroArea ?? null;
    } else if (role === Role.RATER) {
      if (titleProvided && title !== null) raterUpdate.title = title;
      if (companyProvided && company !== null) raterUpdate.company = company;
      if (industryProvided && industryId !== null) {
        raterUpdate.industry = { connect: { id: industryId } };
      }
    } else if (role === Role.SALES_MANAGER || role === Role.RATER_MANAGER) {
      if (companyProvided && company !== null) managerUpdate.company = company;
    }

    // Run user + profile updates atomically.
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }
      if (role === Role.REP && Object.keys(repUpdate).length > 0) {
        await tx.repProfile.update({ where: { userId }, data: repUpdate });
      } else if (role === Role.RATER && Object.keys(raterUpdate).length > 0) {
        await tx.raterProfile.update({ where: { userId }, data: raterUpdate });
      } else if (
        (role === Role.SALES_MANAGER || role === Role.RATER_MANAGER) &&
        Object.keys(managerUpdate).length > 0
      ) {
        await tx.managerProfile.update({ where: { userId }, data: managerUpdate });
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        repProfile: { include: { industry: { select: { slug: true, name: true } } } },
        raterProfile: { include: { industry: { select: { slug: true, name: true } } } },
        managerProfile: true,
      },
    });
    if (!updated) {
      return Response.json({ error: "User no longer exists" }, { status: 404 });
    }
    return serialize(updated);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FullUser = Prisma.UserGetPayload<{
  include: {
    repProfile: { include: { industry: { select: { slug: true; name: true } } } };
    raterProfile: { include: { industry: { select: { slug: true; name: true } } } };
    managerProfile: true;
  };
}>;

function serialize(user: FullUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    state: user.state,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    repProfile: user.repProfile
      ? {
          title: user.repProfile.title,
          company: user.repProfile.company,
          metroArea: user.repProfile.metroArea,
          industry: user.repProfile.industry,
        }
      : null,
    raterProfile: user.raterProfile
      ? {
          title: user.raterProfile.title,
          company: user.raterProfile.company,
          industry: user.raterProfile.industry,
        }
      : null,
    managerProfile: user.managerProfile
      ? {
          managesType: user.managerProfile.managesType,
          company: user.managerProfile.company,
        }
      : null,
  };
}

function badReq(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}
