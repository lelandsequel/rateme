// /me/edit — edit profile + upload avatar.
//
// Server Component fetches the current user + the industry list, then hands
// off to two Client Components: <AvatarUpload /> for the file pickup +
// upload flow, and <ProfileEditForm /> for the textual fields. The form
// layout mirrors signup, but with current values pre-filled.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { INDUSTRIES_V1 } from "@/lib/industries";
import { AvatarUpload } from "./AvatarUpload";
import { ProfileEditForm } from "./ProfileEditForm";

export const dynamic = "force-dynamic";

async function loadIndustries() {
  if (!HAS_DB) return INDUSTRIES_V1.map((i) => ({ slug: i.slug, name: i.name }));
  return prisma.industry.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/me/edit");

  if (!HAS_DB) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Profile editing unavailable</h1>
        <p className="text-[#475569]">
          The database isn&apos;t configured in this environment. This is the mock-mode shell.
        </p>
      </div>
    );
  }

  const [user, industries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        repProfile: { include: { industry: { select: { slug: true } } } },
        raterProfile: { include: { industry: { select: { slug: true } } } },
        managerProfile: true,
      },
    }),
    loadIndustries(),
  ]);

  if (!user) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Account missing</h1>
        <p className="text-[#475569]">Your user row was deleted. Sign out and sign back in.</p>
      </div>
    );
  }

  const initial = {
    role: user.role as Role,
    name: user.name,
    state: user.state,
    title:
      user.role === Role.REP
        ? user.repProfile?.title ?? ""
        : user.role === Role.RATER
          ? user.raterProfile?.title ?? ""
          : "",
    company:
      user.role === Role.REP
        ? user.repProfile?.company ?? ""
        : user.role === Role.RATER
          ? user.raterProfile?.company ?? ""
          : user.role === Role.SALES_MANAGER || user.role === Role.RATER_MANAGER
            ? user.managerProfile?.company ?? ""
            : "",
    industrySlug:
      user.role === Role.REP
        ? user.repProfile?.industry?.slug ?? ""
        : user.role === Role.RATER
          ? user.raterProfile?.industry?.slug ?? ""
          : "",
    metroArea: user.role === Role.REP ? user.repProfile?.metroArea ?? "" : "",
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit profile</h1>
        <Link href="/me" className="text-sm text-[#94a3b8] hover:text-[#0f172a]">
          Back to /me
        </Link>
      </div>

      <section className="bg-[#ffffff] rounded-xl p-6 border border-[#e5e7eb]">
        <h2 className="text-base font-semibold mb-4">Avatar</h2>
        <AvatarUpload initialAvatarUrl={user.avatarUrl} userName={user.name} />
      </section>

      <section className="bg-[#ffffff] rounded-xl p-6 border border-[#e5e7eb]">
        <h2 className="text-base font-semibold mb-4">Profile</h2>
        <ProfileEditForm industries={industries} initial={initial} />
      </section>
    </div>
  );
}
