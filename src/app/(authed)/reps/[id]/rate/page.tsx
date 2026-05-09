// Rating form for a connected rater to rate a rep.
//
// Server-loads the rep's industry's question set so the form renders with
// the right N (typically 10) questions tied to that industry.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, Role } from "@prisma/client";
import { RatingForm, type RatingFormQuestion } from "./RatingForm";

export const dynamic = "force-dynamic";

export default async function RatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ratingRequestId?: string }>;
}) {
  const { id: repUserId } = await params;
  const { ratingRequestId } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/reps/${repUserId}/rate`);
  if (session.user.role !== Role.RATER) {
    return <p className="text-[#475569]">Only Raters can submit ratings.</p>;
  }

  const conn = await prisma.connection.findUnique({
    where: { repUserId_raterUserId: { repUserId, raterUserId: session.user.id } },
  });
  if (!conn || conn.status !== ConnectionStatus.ACCEPTED) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">You aren&apos;t connected to this rep</h1>
        <p className="text-[#475569]">Request a connection first; once they accept, you can rate.</p>
      </div>
    );
  }

  const rep = await prisma.user.findUnique({
    where: { id: repUserId },
    include: {
      repProfile: {
        include: {
          industry: {
            include: {
              questionSet: {
                include: {
                  questions: { orderBy: { ord: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!rep?.repProfile) return <p>Rep not found.</p>;

  const set = rep.repProfile.industry.questionSet;
  if (!set || set.questions.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Questions not configured</h1>
        <p className="text-[#475569]">
          This rep&apos;s industry doesn&apos;t have a question set yet. Try again later.
        </p>
      </div>
    );
  }

  const questions: RatingFormQuestion[] = set.questions.map((q) => ({
    id: q.id,
    key: q.key,
    ord: q.ord,
    labelEn: q.labelEn,
    labelEs: q.labelEs,
    labelPt: q.labelPt,
  }));

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Rate</p>
        <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
        <p className="text-[#475569]">{rep.repProfile.title} · {rep.repProfile.company}</p>
        <p className="text-xs text-[#94a3b8] mt-1">{set.name} · {set.questions.length} questions</p>
      </header>
      <RatingForm
        repUserId={rep.id}
        questions={questions}
        ratingRequestId={ratingRequestId}
      />
    </div>
  );
}
