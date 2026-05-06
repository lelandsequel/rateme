// PATCH /api/connections/:id — accept/reject/disconnect.
//
// Body: { action: "accept" | "reject" | "disconnect" }
//
// Authorization rules:
//   accept / reject — only the side that DID NOT initiate may accept/reject
//                     (and the connection must be PENDING).
//   disconnect     — either side can disconnect an ACCEPTED connection.
//                    Effect: status → DISCONNECTED.

import { ConnectionInitiator, ConnectionStatus } from "@prisma/client";

import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface PatchBody {
  action?: unknown;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await ctx.params;

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const action = typeof body.action === "string" ? body.action : null;
    if (action !== "accept" && action !== "reject" && action !== "disconnect") {
      return Response.json(
        { error: "action must be one of: accept, reject, disconnect" },
        { status: 400 },
      );
    }

    const conn = await prisma.connection.findUnique({ where: { id } });
    if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

    const isRep = conn.repUserId === session.user.id;
    const isRater = conn.raterUserId === session.user.id;
    if (!isRep && !isRater) {
      return Response.json({ error: "Not a party to this connection" }, { status: 403 });
    }

    if (action === "accept" || action === "reject") {
      if (conn.status !== ConnectionStatus.PENDING) {
        return Response.json(
          { error: `Cannot ${action} a connection that is ${conn.status}` },
          { status: 409 },
        );
      }
      const initiatorIsRep = conn.initiatedBy === ConnectionInitiator.REP;
      const initiatorIsCurrent =
        (initiatorIsRep && isRep) || (!initiatorIsRep && isRater);
      if (initiatorIsCurrent) {
        return Response.json(
          { error: "Initiator cannot accept/reject their own request" },
          { status: 403 },
        );
      }
      const updated = await prisma.connection.update({
        where: { id },
        data: {
          status:
            action === "accept" ? ConnectionStatus.ACCEPTED : ConnectionStatus.REJECTED,
          respondedAt: new Date(),
        },
      });
      return { connection: updated };
    }

    // disconnect
    if (conn.status !== ConnectionStatus.ACCEPTED) {
      return Response.json(
        { error: `Cannot disconnect from a connection that is ${conn.status}` },
        { status: 409 },
      );
    }
    const updated = await prisma.connection.update({
      where: { id },
      data: {
        status: ConnectionStatus.DISCONNECTED,
        respondedAt: new Date(),
      },
    });
    return { connection: updated };
  });
}
