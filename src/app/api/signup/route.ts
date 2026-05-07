// POST /api/signup — create a new user account.
//
// Role-aware: a single endpoint, but the body shape differs by role.
// The matching profile child row is created in the same transaction.
//
// On success returns { token, user } — the same shape as /api/mobile/login
// so the client can immediately authenticate.

import bcrypt from "bcrypt";
import { Role, USState, ManagerType } from "@prisma/client";

import { handle } from "@/lib/api";
import { issueAndSendVerify } from "@/lib/auth-emails";
import { HAS_DB } from "@/lib/env";
import { signMobileToken } from "@/lib/mobile-token";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = new Set<Role>([
  Role.REP,
  Role.RATER,
  Role.SALES_MANAGER,
  Role.RATER_MANAGER,
]);

const VALID_STATES = new Set<USState>(Object.values(USState));

function isStrongEnoughPassword(p: string): boolean {
  return p.length >= 8;
}

function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

interface SignupBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  role?: unknown;
  state?: unknown; // 2-letter state code
  // Role-specific:
  title?: unknown;
  company?: unknown;
  industrySlug?: unknown;
  metroArea?: unknown;
}

export async function POST(req: Request) {
  return handle(async () => {
    let body: SignupBody;
    try {
      body = (await req.json()) as SignupBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const password = typeof body.password === "string" ? body.password : null;
    const name = typeof body.name === "string" ? body.name.trim() : null;
    const role = typeof body.role === "string" ? (body.role as Role) : null;
    const state = typeof body.state === "string" ? (body.state.toUpperCase() as USState) : null;

    if (!email || !isEmailish(email)) return badReq("valid email required");
    if (!password || !isStrongEnoughPassword(password)) return badReq("password must be at least 8 characters");
    if (!name) return badReq("name required");
    if (!role || !VALID_ROLES.has(role)) return badReq("role must be REP, RATER, SALES_MANAGER, or RATER_MANAGER");
    if (!state || !VALID_STATES.has(state)) return badReq("state must be a valid 2-letter US state code");

    // Role-specific validation.
    const title = typeof body.title === "string" ? body.title.trim() : null;
    const company = typeof body.company === "string" ? body.company.trim() : null;
    const industrySlug = typeof body.industrySlug === "string" ? body.industrySlug : null;
    const metroArea = typeof body.metroArea === "string" ? body.metroArea.trim() : null;

    if (role === Role.REP || role === Role.RATER) {
      if (!title) return badReq("title required");
      if (!company) return badReq("company required");
      if (!industrySlug) return badReq("industrySlug required");
    }
    if (role === Role.SALES_MANAGER || role === Role.RATER_MANAGER) {
      if (!company) return badReq("company required");
    }

    if (!HAS_DB) {
      return Response.json({ error: "Database is not configured" }, { status: 503 });
    }

    // Email uniqueness check.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return Response.json({ error: "Email already registered" }, { status: 409 });

    // Industry lookup (for REP / RATER).
    let industryId: string | null = null;
    if (industrySlug) {
      const ind = await prisma.industry.findUnique({ where: { slug: industrySlug } });
      if (!ind) return badReq(`industrySlug not recognized: ${industrySlug}`);
      industryId = ind.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        state,
        ...(role === Role.REP && industryId && title && company
          ? {
              repProfile: {
                create: { title, company, industryId, metroArea: metroArea ?? null },
              },
            }
          : {}),
        ...(role === Role.RATER && industryId && title && company
          ? {
              raterProfile: {
                create: { title, company, industryId },
              },
            }
          : {}),
        ...(role === Role.SALES_MANAGER && company
          ? {
              managerProfile: {
                create: { managesType: ManagerType.REP_MANAGER, company },
              },
            }
          : {}),
        ...(role === Role.RATER_MANAGER && company
          ? {
              managerProfile: {
                create: { managesType: ManagerType.RATER_MANAGER, company },
              },
            }
          : {}),
      },
    });

    // Fire-and-forget: kick off email verification. We deliberately don't
    // block signup on Resend's response — a failed send is logged and the
    // user can request a new link via /forgot-password (same machinery).
    void issueAndSendVerify({
      id: created.id,
      name: created.name,
      email: created.email,
    }).catch((err) => {
      console.warn("[signup] verify email failed:", err);
    });

    const token = await signMobileToken({
      sub: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    });

    return Response.json({
      token,
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        state: created.state,
      },
    });
  });
}

function badReq(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}
