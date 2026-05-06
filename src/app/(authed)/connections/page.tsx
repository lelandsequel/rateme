// Connections inbox — pending / accepted / rejected / disconnected.
//
// Pending requests fall into two buckets per user: those YOU sent
// (waiting on the other side), and those sent TO YOU (waiting on your
// accept/reject). Distinct UX since the actions differ.

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, ConnectionInitiator, Role } from "@prisma/client";
import { ConnectionAction } from "./ConnectionAction";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const role = session.user.role;
  const viewerIsRep = role === Role.REP;
  const viewerIsRater = role === Role.RATER;

  const conns = await prisma.connection.findMany({
    where: {
      OR: [{ repUserId: userId }, { raterUserId: userId }],
    },
    orderBy: { requestedAt: "desc" },
    include: {
      rep: { include: { repProfile: { include: { industry: { select: { name: true } } } } } },
      rater: { include: { raterProfile: { include: { industry: { select: { name: true } } } } } },
    },
  });

  // Bucket: incoming-pending (need my action), outgoing-pending (waiting),
  // accepted, ended.
  const incomingPending = conns.filter((c) => {
    if (c.status !== ConnectionStatus.PENDING) return false;
    const initiatorIsRep = c.initiatedBy === ConnectionInitiator.REP;
    const iAmRep = c.repUserId === userId;
    const initiatorIsMe = (initiatorIsRep && iAmRep) || (!initiatorIsRep && !iAmRep);
    return !initiatorIsMe;
  });
  const outgoingPending = conns.filter((c) => {
    if (c.status !== ConnectionStatus.PENDING) return false;
    const initiatorIsRep = c.initiatedBy === ConnectionInitiator.REP;
    const iAmRep = c.repUserId === userId;
    return (initiatorIsRep && iAmRep) || (!initiatorIsRep && !iAmRep);
  });
  const accepted = conns.filter((c) => c.status === ConnectionStatus.ACCEPTED);
  const ended = conns.filter(
    (c) => c.status === ConnectionStatus.REJECTED || c.status === ConnectionStatus.DISCONNECTED,
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#9da4c1]">Inbox</p>
        <h1 className="text-3xl font-bold mt-1">Connections</h1>
      </header>

      <Section title={`Awaiting your action (${incomingPending.length})`} accent="caution">
        {incomingPending.length === 0 ? (
          <Empty>Nothing waiting on you.</Empty>
        ) : (
          <ul className="space-y-2">
            {incomingPending.map((c) => (
              <Row key={c.id} c={c} userId={userId} viewerIsRep={viewerIsRep} viewerIsRater={viewerIsRater}>
                <ConnectionAction id={c.id} actions={["accept", "reject"]} />
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Pending (sent — ${outgoingPending.length})`}>
        {outgoingPending.length === 0 ? (
          <Empty>No outgoing requests.</Empty>
        ) : (
          <ul className="space-y-2">
            {outgoingPending.map((c) => (
              <Row key={c.id} c={c} userId={userId} viewerIsRep={viewerIsRep} viewerIsRater={viewerIsRater}>
                <span className="text-xs text-[#9da4c1]">Awaiting response</span>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Active connections (${accepted.length})`}>
        {accepted.length === 0 ? (
          <Empty>No active connections yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {accepted.map((c) => (
              <Row key={c.id} c={c} userId={userId} viewerIsRep={viewerIsRep} viewerIsRater={viewerIsRater}>
                <div className="flex items-center gap-2">
                  {viewerIsRater && (
                    <Link href={`/reps/${c.repUserId}/rate`} className="text-xs px-3 py-1.5 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium hover:bg-[#bbc3ff]/80">
                      Rate
                    </Link>
                  )}
                  <ConnectionAction id={c.id} actions={["disconnect"]} />
                </div>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      {ended.length > 0 && (
        <Section title={`Ended / rejected (${ended.length})`}>
          <ul className="space-y-2">
            {ended.map((c) => (
              <Row key={c.id} c={c} userId={userId} viewerIsRep={viewerIsRep} viewerIsRater={viewerIsRater}>
                <span className="text-xs text-[#9da4c1]">{c.status}</span>
              </Row>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

interface ConnRow {
  id: string;
  status: ConnectionStatus;
  initiatedBy: ConnectionInitiator;
  repUserId: string;
  raterUserId: string;
  rep: {
    id: string;
    name: string;
    repProfile: { title: string; company: string; industry: { name: string } } | null;
  };
  rater: {
    id: string;
    name: string;
    raterProfile: { title: string; company: string; industry: { name: string } } | null;
  };
}

function Row({
  c,
  userId,
  viewerIsRep,
  viewerIsRater,
  children,
}: {
  c: ConnRow;
  userId: string;
  viewerIsRep: boolean;
  viewerIsRater: boolean;
  children?: React.ReactNode;
}) {
  // Show the OTHER party. Apply rater-redaction unless I AM the rater.
  const otherIsRep = c.raterUserId === userId;
  if (otherIsRep) {
    // I'm the rater; show rep in full.
    return (
      <li className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4 flex items-start justify-between">
        <div>
          <Link href={`/reps/${c.rep.id}`} className="font-bold text-[#dae2fd] hover:text-[#bbc3ff]">{c.rep.name}</Link>
          <div className="text-sm text-[#c6c5d4]">
            {c.rep.repProfile?.title} · {c.rep.repProfile?.company}
          </div>
          <div className="text-xs text-[#9da4c1] mt-1">{c.rep.repProfile?.industry.name}</div>
        </div>
        {children}
      </li>
    );
  }
  // I'm the rep; show rater REDACTED.
  return (
    <li className="bg-[#131b2e] rounded-lg border border-[#171f33]/50 p-4 flex items-start justify-between">
      <div>
        <div className="font-bold text-[#dae2fd]">{c.rater.raterProfile?.title ?? "?"}</div>
        <div className="text-sm text-[#c6c5d4]">{c.rater.raterProfile?.company ?? "?"}</div>
        <div className="text-xs text-[#9da4c1] mt-1">{c.rater.raterProfile?.industry.name ?? "?"}</div>
      </div>
      {children}
    </li>
  );
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: "caution" }) {
  return (
    <section>
      <h2 className={`font-bold mb-3 ${accent === "caution" ? "text-[#f5c97a]" : ""}`}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#9da4c1] italic">{children}</p>;
}
