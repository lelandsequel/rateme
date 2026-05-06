// Rating form for a connected rater to rate a rep.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, Role } from "@prisma/client";
import { RatingForm } from "./RatingForm";

export const dynamic = "force-dynamic";

export default async function RatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: repUserId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/reps/${repUserId}/rate`);
  if (session.user.role !== Role.RATER) {
    return <p className="text-[#c6c5d4]">Only Raters can submit ratings.</p>;
  }

  const conn = await prisma.connection.findUnique({
    where: { repUserId_raterUserId: { repUserId, raterUserId: session.user.id } },
  });
  if (!conn || conn.status !== ConnectionStatus.ACCEPTED) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">You aren't connected to this rep</h1>
        <p className="text-[#c6c5d4]">Request a connection first; once they accept, you can rate.</p>
      </div>
    );
  }

  const rep = await prisma.user.findUnique({
    where: { id: repUserId },
    include: { repProfile: { include: { industry: true } } },
  });
  if (!rep?.repProfile) return <p>Rep not found.</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Rate</p>
        <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
        <p className="text-[#c6c5d4]">{rep.repProfile.title} · {rep.repProfile.company}</p>
      </header>
      <RatingForm repUserId={rep.id} />
    </div>
  );
}
