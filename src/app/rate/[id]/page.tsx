// Public /rate/[id] — entry point for both ONE_TIME and ON_BEHALF rating
// requests. Rendered OUTSIDE (authed) so unauthenticated invitees can land
// here and learn what to do next (signup / login / rate).

import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ConnectionInitiator,
  ConnectionStatus,
  RatingRequestStatus,
  RatingRequestType,
} from "@prisma/client";
import { RatingForm } from "@/app/(authed)/reps/[id]/rate/RatingForm";

export const dynamic = "force-dynamic";

export default async function RatePublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rr = await prisma.ratingRequest.findUnique({
    where: { id },
    include: {
      forRep: {
        include: { repProfile: { include: { industry: true } } },
      },
    },
  });
  if (!rr) return <Notice title="Invalid invitation" body="This invitation link isn't valid or has expired." />;

  if (rr.status === RatingRequestStatus.COMPLETED) {
    return <Notice title="Already used" body="This invitation has already been used." />;
  }
  if (rr.status === RatingRequestStatus.CANCELLED) {
    return <Notice title="Cancelled" body="This invitation was cancelled." />;
  }
  if (rr.status === RatingRequestStatus.EXPIRED || rr.expiresAt.getTime() < Date.now()) {
    if (rr.status !== RatingRequestStatus.EXPIRED) {
      // Best-effort transition; ignore failures.
      try {
        await prisma.ratingRequest.update({
          where: { id: rr.id },
          data: { status: RatingRequestStatus.EXPIRED },
        });
      } catch {
        // ignore
      }
    }
    return <Notice title="Expired" body="This invitation has expired." />;
  }

  const rep = rr.forRep;
  if (!rep?.repProfile) {
    return <Notice title="Invalid invitation" body="The rep on this invitation no longer has a profile." />;
  }

  const session = await auth();

  if (rr.type === RatingRequestType.ONE_TIME) {
    return ONE_TIME_view({
      rrId: rr.id,
      repUserId: rep.id,
      repName: rep.name,
      repTitle: rep.repProfile.title,
      repCompany: rep.repProfile.company,
      toEmail: rr.toEmail ?? "",
      sessionUserId: session?.user?.id ?? null,
      sessionEmail: session?.user?.email ?? null,
      sessionRole: session?.user?.role ?? null,
    });
  }

  // ON_BEHALF
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/rate/${rr.id}`);
  }
  if (rr.toRaterUserId !== session.user.id) {
    return (
      <Notice
        title="Wrong account"
        body="This request is for a different rater. Sign in as the invited rater to continue."
      />
    );
  }

  return (
    <Frame>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Rate request</p>
        <h1 className="text-3xl font-bold mt-1">{rep.name}</h1>
        <p className="text-[#475569]">{rep.repProfile.title} · {rep.repProfile.company}</p>
      </header>
      <RatingForm
        repUserId={rep.id}
        ratingRequestId={rr.id}
        redirectAfter="/connections"
      />
    </Frame>
  );
}

async function ONE_TIME_view({
  rrId,
  repUserId,
  repName,
  repTitle,
  repCompany,
  toEmail,
  sessionUserId,
  sessionEmail,
  sessionRole,
}: {
  rrId: string;
  repUserId: string;
  repName: string;
  repTitle: string;
  repCompany: string;
  toEmail: string;
  sessionUserId: string | null;
  sessionEmail: string | null;
  sessionRole: string | null;
}) {
  // Lookup the user behind toEmail.
  const existing = toEmail
    ? await prisma.user.findUnique({
        where: { email: toEmail },
        select: { id: true, role: true },
      })
    : null;

  if (!existing) {
    return (
      <Notice
        title={`${repName} invited you to rate them`}
        body={
          <>
            We don&apos;t have an RMR account for <span className="text-[#0f172a]">{toEmail}</span> yet.
            Sign up first, then return to this link to finish the rating.
            <div className="mt-4">
              <Link
                href={`/signup?email=${encodeURIComponent(toEmail)}&role=RATER`}
                className="inline-flex px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]"
              >
                Sign up to rate
              </Link>
            </div>
          </>
        }
      />
    );
  }

  // Existing user — check the connection state.
  const conn = await prisma.connection.findUnique({
    where: {
      repUserId_raterUserId: { repUserId, raterUserId: existing.id },
    },
  });

  if (conn?.status === ConnectionStatus.ACCEPTED) {
    if (sessionUserId === existing.id) {
      // Already authed AND connected — show the rating form.
      return (
        <Frame>
          <header className="mb-6">
            <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Rate</p>
            <h1 className="text-3xl font-bold mt-1">{repName}</h1>
            <p className="text-[#475569]">{repTitle} · {repCompany}</p>
          </header>
          <RatingForm
            repUserId={repUserId}
            ratingRequestId={rrId}
            redirectAfter="/connections"
          />
        </Frame>
      );
    }
    return (
      <Notice
        title="You can rate from your dashboard"
        body={
          <>
            You&apos;re already connected to {repName}. Sign in to rate.
            <div className="mt-4">
              <Link
                href={`/login?callbackUrl=/reps/${repUserId}/rate?ratingRequestId=${rrId}`}
                className="inline-flex px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]"
              >
                Sign in
              </Link>
            </div>
          </>
        }
      />
    );
  }

  // Existing user but no accepted connection. If signed in as that user,
  // auto-create / accept the connection and surface the rating form.
  if (sessionUserId === existing.id) {
    if (sessionRole !== "RATER") {
      return (
        <Notice
          title="Switch accounts"
          body="The invited email is registered with a non-rater role. Sign in as a rater account."
        />
      );
    }
    if (!conn) {
      try {
        await prisma.connection.create({
          data: {
            repUserId,
            raterUserId: existing.id,
            initiatedBy: ConnectionInitiator.REP,
            status: ConnectionStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });
      } catch {
        // ignore — race; the next render will see it.
      }
    } else {
      // Conn exists but is not ACCEPTED (we returned early above for that
      // case), so flip it.
      try {
        await prisma.connection.update({
          where: { id: conn.id },
          data: {
            status: ConnectionStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });
      } catch {
        // ignore
      }
    }
    return (
      <Frame>
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Rate</p>
          <h1 className="text-3xl font-bold mt-1">{repName}</h1>
          <p className="text-[#475569]">{repTitle} · {repCompany}</p>
        </header>
        <RatingForm
          repUserId={repUserId}
          ratingRequestId={rrId}
          redirectAfter="/connections"
        />
      </Frame>
    );
  }

  // Existing user but viewer not signed in (or signed in as someone else).
  const wrongAccount = sessionUserId && sessionEmail && sessionUserId !== existing.id;
  return (
    <Notice
      title={wrongAccount ? "Different account" : "Sign in to accept"}
      body={
        <>
          {wrongAccount
            ? `This invite is for ${toEmail}. Sign out and sign in as that account to continue.`
            : "Sign in to accept the invitation and rate."}
          <div className="mt-4">
            <Link
              href={`/login?callbackUrl=/rate/${rrId}`}
              className="inline-flex px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]"
            >
              Sign in
            </Link>
          </div>
        </>
      }
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#ffffff] text-[#0f172a] p-6">
      <div className="mx-auto max-w-xl py-12">{children}</div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Frame>
      <div className="bg-[#ffffff] rounded-xl p-8 border border-[#e5e7eb]">
        <h1 className="text-2xl font-bold mb-3">{title}</h1>
        <div className="text-[#475569] text-sm">{body}</div>
      </div>
    </Frame>
  );
}
