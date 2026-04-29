/**
 * Small helpers shared by all API route handlers.
 */

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Validate route param ids — cuid-shaped or short safe strings. */
export function isValidId(id: string | undefined | null): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** Parse a positive integer query param, with bounds. */
export function parseIntParam(
  raw: string | null,
  fallback: number,
  min = 1,
  max = 1000,
): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Convert a thrown Response (from requireSession/requireTenant) back into a Response. */
export function isResponse(err: unknown): err is Response {
  return err instanceof Response;
}

/** Wrap a handler so thrown Responses pass through and other errors return 500. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out);
  } catch (err) {
    if (isResponse(err)) return err;
    console.error("[api] unhandled error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
