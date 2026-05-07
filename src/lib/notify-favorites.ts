// Fan-out helper: when a Rep receives a new Rating, every Rater who has
// favorited that Rep gets a notification (push + email + log row).
//
// Privacy contract: the notification ONLY names the REP. It NEVER mentions
// the rater who submitted the rating — leaking that to a third party would
// expose buyer identity (and is also explicitly out of scope per spec).
//
// Side effects are best-effort: if push or email fails, the rating creation
// still succeeds and the NotificationLog row records what we tried.

import { prisma } from "@/lib/prisma";

export interface FavoriteNotifyInput {
  /** Internal id used to deduplicate / link in logs. */
  ratingId: string;
  /** The Rep who just received the rating — subject of the notification. */
  repUserId: string;
  /** Average overall score of the new rating, rounded to 1 decimal. */
  overall: number;
}

interface PushSendResult {
  attempted: boolean;
  ok: boolean;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function appOrigin(): string {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "https://ratemyrep.app";
}

async function sendPush(
  tokens: ReadonlyArray<string>,
  body: string,
  data: Record<string, unknown>,
): Promise<PushSendResult> {
  if (tokens.length === 0) return { attempted: false, ok: false };
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: "RateMyRep",
    body,
    data,
  }));
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    return { attempted: true, ok: res.ok };
  } catch {
    return { attempted: true, ok: false };
  }
}

async function sendEmail(
  to: string,
  repName: string,
  repUserId: string,
): Promise<{ attempted: boolean; ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { attempted: false, ok: false };
  if (!to) return { attempted: false, ok: false };

  const url = `${appOrigin()}/reps/${repUserId}`;
  const subject = `${repName} just got rated on RateMyRep`;
  const html =
    `<p>${escapeHtml(repName)} — one of the reps you're watching — just received a new rating.</p>` +
    `<p><a href="${url}">View profile</a></p>`;
  const text = `${repName} just got a new rating on RateMyRep. View profile: ${url}`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "RateMyRep <noreply@ratemyrep.app>",
        to,
        subject,
        html,
        text,
      }),
    });
    return { attempted: true, ok: res.ok };
  } catch {
    return { attempted: true, ok: false };
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] as string),
  );
}

/**
 * Fan a new Rating out to everyone who's favorited the rep.
 *
 * Designed to be called via `void notifyFavoritesOfRating(...)` from the
 * rating create handler — failures inside MUST NOT propagate and MUST NOT
 * fail the rating create. We swallow at every boundary.
 */
export async function notifyFavoritesOfRating(
  input: FavoriteNotifyInput,
): Promise<void> {
  try {
    const { ratingId, repUserId, overall } = input;

    const rep = await prisma.user.findUnique({
      where: { id: repUserId },
      select: { id: true, name: true },
    });
    if (!rep) return;

    const favorites = await prisma.favorite.findMany({
      where: { repUserId },
      select: { raterUserId: true },
    });
    if (favorites.length === 0) return;

    const raterIds = favorites.map((f) => f.raterUserId);

    // Pull each watching rater's email + push tokens in one shot.
    const raters = await prisma.user.findMany({
      where: { id: { in: raterIds } },
      select: {
        id: true,
        email: true,
        pushTokens: { select: { token: true } },
      },
    });

    const pushBody = `${rep.name} just got a new rating (${overall.toFixed(1)} stars)`;
    const pushData = {
      kind: "favorite-rating",
      repUserId: rep.id,
      ratingId,
    };

    await Promise.all(
      raters.map(async (rater) => {
        // Run push + email in parallel; both are best-effort.
        const [pushRes, emailRes] = await Promise.all([
          sendPush(
            rater.pushTokens.map((t) => t.token),
            pushBody,
            pushData,
          ),
          sendEmail(rater.email, rep.name, rep.id),
        ]);

        try {
          await prisma.notificationLog.create({
            data: {
              userId: rater.id,
              kind: "favorite-rating",
              payload: JSON.stringify({
                repUserId: rep.id,
                repName: rep.name,
                overall,
                ratingId,
              }),
              pushSent: pushRes.attempted && pushRes.ok,
              emailSent: emailRes.attempted && emailRes.ok,
            },
          });
        } catch {
          // Log row failure is non-fatal — we still delivered to the
          // outside world (or tried to).
        }
      }),
    );
  } catch {
    // Top-level swallow — defense in depth so this can never bubble into
    // the rating-create response path.
  }
}
