// /team — Manager Team Module.
//
// Manager view (SALES_MANAGER / RATER_MANAGER):
//   - bulk invite form
//   - pending invites
//   - active team
//   - cross-side connection roll-up (raters connected to my reps, or
//     reps connected to my raters)
//
// Member view (REP / RATER):
//   - pending invites with accept/decline
//   - active manager(s) with leave

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, Role } from "@prisma/client";
import { publicRater, type PublicRater } from "@/lib/redact";
import { InviteForm } from "./InviteForm";
import { MembershipAction } from "./MembershipAction";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const role = session.user.role ?? "";
  if (role === Role.SALES_MANAGER || role === Role.RATER_MANAGER) {
    return <ManagerView userId={session.user.id} role={role} />;
  }
  return <MemberView userId={session.user.id} />;
}

async function ManagerView({ userId, role }: { userId: string; role: string }) {
  const memberships = await prisma.teamMembership.findMany({
    where: { managerId: userId, endedAt: null },
    orderBy: { invitedAt: "desc" },
    include: {
      member: {
        include: {
          repProfile: { include: { industry: { select: { name: true } } } },
          raterProfile: { include: { industry: { select: { name: true } } } },
          _count: { select: { ratingsReceived: true } },
        },
      },
    },
  });

  const pending = memberships.filter((m) => !m.acceptedAt);
  const active = memberships.filter((m) => m.acceptedAt);

  // Cross-side connections.
  const activeMemberIds = active.map((m) => m.memberId);
  let connectedRaters: Array<PublicRater & { connectedToReps: Array<{ repId: string; repName: string }> }> = [];
  let connectedReps: Array<{
    id: string;
    name: string;
    title: string;
    company: string;
    industry: { slug: string; name: string };
    connectedToRaters: Array<{ raterId: string; raterTitle: string; raterCompany: string }>;
  }> = [];

  if (activeMemberIds.length > 0) {
    if (role === Role.SALES_MANAGER) {
      const conns = await prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACCEPTED,
          repUserId: { in: activeMemberIds },
        },
        include: {
          rep: { select: { id: true, name: true } },
          rater: {
            include: {
              raterProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
        },
      });
      const byRater = new Map<string, { rater: PublicRater; reps: Array<{ repId: string; repName: string }> }>();
      for (const c of conns) {
        if (!c.rater.raterProfile) continue;
        const repEntry = { repId: c.rep.id, repName: c.rep.name };
        const existing = byRater.get(c.raterUserId);
        if (existing) {
          if (!existing.reps.find((r) => r.repId === repEntry.repId)) existing.reps.push(repEntry);
          continue;
        }
        byRater.set(c.raterUserId, {
          rater: publicRater({
            userId: c.rater.id,
            user: c.rater,
            title: c.rater.raterProfile.title,
            company: c.rater.raterProfile.company,
            industry: c.rater.raterProfile.industry,
          }),
          reps: [repEntry],
        });
      }
      connectedRaters = Array.from(byRater.values()).map((v) => ({
        ...v.rater,
        connectedToReps: v.reps,
      }));
    } else {
      const conns = await prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACCEPTED,
          raterUserId: { in: activeMemberIds },
        },
        include: {
          rep: {
            include: {
              repProfile: {
                include: { industry: { select: { slug: true, name: true } } },
              },
            },
          },
          rater: { include: { raterProfile: true } },
        },
      });
      const byRep = new Map<string, (typeof connectedReps)[number]>();
      for (const c of conns) {
        if (!c.rep.repProfile) continue;
        const raterEntry = {
          raterId: c.rater.id,
          raterTitle: c.rater.raterProfile?.title ?? "",
          raterCompany: c.rater.raterProfile?.company ?? "",
        };
        const existing = byRep.get(c.repUserId);
        if (existing) {
          if (!existing.connectedToRaters.find((r) => r.raterId === raterEntry.raterId)) {
            existing.connectedToRaters.push(raterEntry);
          }
          continue;
        }
        byRep.set(c.repUserId, {
          id: c.rep.id,
          name: c.rep.name,
          title: c.rep.repProfile.title,
          company: c.rep.repProfile.company,
          industry: c.rep.repProfile.industry,
          connectedToRaters: [raterEntry],
        });
      }
      connectedReps = Array.from(byRep.values());
    }
  }

  const targetRoleLabel = role === Role.SALES_MANAGER ? "Reps" : "Raters";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Manager</p>
        <h1 className="text-3xl font-bold mt-1">Team</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Invite {targetRoleLabel.toLowerCase()} by email. They&rsquo;ll see a pending invite on their /team page and can accept or decline.
        </p>
      </header>

      <Section title={`Invite ${targetRoleLabel}`}>
        <InviteForm />
      </Section>

      <Section title={`Pending invites (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>No pending invites.</Empty>
        ) : (
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.id}
                className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-bold text-[#0f172a]">{m.member.name}</div>
                  <div className="text-sm text-[#475569]">{m.member.email}</div>
                  <div className="text-xs text-[#94a3b8] mt-1">
                    Invited {new Date(m.invitedAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs text-[#f5c97a]">pending</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Active team (${active.length})`}>
        {active.length === 0 ? (
          <Empty>No active members yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {active.map((m) => {
              const profile = m.member.repProfile ?? m.member.raterProfile;
              const ratingCount =
                m.member.repProfile != null ? m.member._count.ratingsReceived : null;
              return (
                <li
                  key={m.id}
                  className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between"
                >
                  <div>
                    <div className="font-bold text-[#0f172a]">{m.member.name}</div>
                    <div className="text-sm text-[#475569]">
                      {profile?.title} · {profile?.company}
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-1">
                      {profile?.industry.name}
                      {ratingCount !== null && (
                        <> · {ratingCount} rating{ratingCount === 1 ? "" : "s"}</>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[#16a34a]">active</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {role === Role.SALES_MANAGER && (
        <Section title={`Raters connected to my team (${connectedRaters.length})`}>
          {connectedRaters.length === 0 ? (
            <Empty>No raters connected to your reps yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {connectedRaters.map((r) => (
                <li
                  key={r.userId}
                  className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4"
                >
                  <div className="font-bold text-[#0f172a]">{r.title}</div>
                  <div className="text-sm text-[#475569]">{r.company}</div>
                  <div className="text-xs text-[#94a3b8] mt-1">
                    {r.industry.name} · {r.state}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-2">
                    Connected to:{" "}
                    {r.connectedToReps.map((rep) => rep.repName).join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {role === Role.RATER_MANAGER && (
        <Section title={`Reps connected to my team (${connectedReps.length})`}>
          {connectedReps.length === 0 ? (
            <Empty>No reps connected to your raters yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {connectedReps.map((rep) => (
                <li
                  key={rep.id}
                  className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4"
                >
                  <Link
                    href={`/reps/${rep.id}`}
                    className="font-bold text-[#0f172a] hover:text-[#dc2626]"
                  >
                    {rep.name}
                  </Link>
                  <div className="text-sm text-[#475569]">
                    {rep.title} · {rep.company}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-1">{rep.industry.name}</div>
                  <div className="text-xs text-[#94a3b8] mt-2">
                    Connected to:{" "}
                    {rep.connectedToRaters
                      .map((r) => `${r.raterTitle} @ ${r.raterCompany}`)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

async function MemberView({ userId }: { userId: string }) {
  const memberships = await prisma.teamMembership.findMany({
    where: { memberId: userId, endedAt: null },
    orderBy: { invitedAt: "desc" },
    include: {
      manager: { include: { managerProfile: true } },
    },
  });

  const pending = memberships.filter((m) => !m.acceptedAt);
  const active = memberships.filter((m) => m.acceptedAt);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">Inbox</p>
        <h1 className="text-3xl font-bold mt-1">Team</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Manager invitations show up here. Accept to join their team; you can leave at any time.
        </p>
      </header>

      <Section
        title={`Pending invites (${pending.length})`}
        accent={pending.length > 0 ? "caution" : undefined}
      >
        {pending.length === 0 ? (
          <Empty>No pending invites.</Empty>
        ) : (
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.id}
                className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-bold text-[#0f172a]">{m.manager.name}</div>
                  <div className="text-sm text-[#475569]">
                    {m.manager.managerProfile?.company ?? "—"}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-1">
                    {m.manager.managerProfile?.managesType === "REP_MANAGER"
                      ? "Sales Manager"
                      : m.manager.managerProfile?.managesType === "RATER_MANAGER"
                        ? "Rater Manager"
                        : "Manager"}{" "}
                    · invited {new Date(m.invitedAt).toLocaleDateString()}
                  </div>
                </div>
                <MembershipAction id={m.id} actions={["accept", "decline"]} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`My managers (${active.length})`}>
        {active.length === 0 ? (
          <Empty>You aren&rsquo;t on any team yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {active.map((m) => (
              <li
                key={m.id}
                className="bg-[#ffffff] rounded-lg border border-[#e5e7eb] p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-bold text-[#0f172a]">{m.manager.name}</div>
                  <div className="text-sm text-[#475569]">
                    {m.manager.managerProfile?.company ?? "—"}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-1">
                    Joined{" "}
                    {m.acceptedAt
                      ? new Date(m.acceptedAt).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
                <MembershipAction id={m.id} actions={["leave"]} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: "caution";
}) {
  return (
    <section>
      <h2 className={`font-bold mb-3 ${accent === "caution" ? "text-[#f5c97a]" : ""}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#94a3b8] italic">{children}</p>;
}
