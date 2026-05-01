// Mobile JWT helpers — used by /api/mobile/login to mint tokens and by
// requireSession to verify Authorization: Bearer headers.
//
// We sign with AUTH_SECRET (the same secret Auth.js uses for cookie JWTs)
// over HS256. This token is INDEPENDENT of the Auth.js cookie session — it
// exists specifically because mobile clients (iOS NSURLSession in particular)
// have unreliable cookie storage for the __Secure-/__Host- prefixed cookies
// Auth.js sets on production HTTPS responses.

import { jwtVerify, SignJWT } from "jose";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface MobileTokenPayload {
  sub: string; // userId
  email: string;
  name: string;
  tenantId: string;
  role: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(payload: MobileTokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setSubject(payload.sub)
    .sign(getSecretKey());
}

export async function verifyMobileToken(
  token: string,
): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      tenantId: payload.tenantId,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
