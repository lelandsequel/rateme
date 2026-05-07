/**
 * Tiny email-sending wrapper.
 *
 * Two modes:
 *   - Real send via Resend HTTP API (no SDK install) when RESEND_API_KEY
 *     is set in the environment.
 *   - Stub mode otherwise — logs a one-line summary and returns ok. This
 *     keeps the weekly-highlights cron job idempotent in dev/staging
 *     without requiring vendor keys.
 *
 * On Resend HTTP errors we return a structured `{ ok: false, error }` —
 * we never throw — so callers (the cron loop) can continue and aggregate.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult =
  | { ok: true; provider: "resend" | "stub"; id?: string }
  | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "RateMyRep <noreply@ratemedrafts.com>";

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Stub mode — one-line, easy to grep.
    console.log(`[email-stub] to=${msg.to} subject=${msg.subject}`);
    return { ok: true, provider: "stub" };
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
  } catch (err) {
    return { ok: false, error: `resend fetch failed: ${stringifyError(err)}` };
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `resend ${res.status}: ${body || res.statusText}`,
    };
  }

  let id: string | undefined;
  try {
    const json = (await res.json()) as { id?: unknown };
    if (typeof json?.id === "string") id = json.id;
  } catch {
    // body wasn't JSON — that's fine, treat as success anyway
  }

  return { ok: true, provider: "resend", id };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}
