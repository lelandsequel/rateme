// GET /api/me — return the current user with their role-specific profile.
//
// Self-view, so includes everything (name, email, full profile fields).
// The redact layer is for the OUTSIDE world looking IN; /me is the
// authenticated user looking at themselves.

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  });
}
