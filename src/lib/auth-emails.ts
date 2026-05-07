/**
 * Helpers that pair token issuance with sending the corresponding email.
 *
 * Kept separate from `auth-tokens.ts` so the pure token logic stays
 * trivially unit-testable without any email machinery.
 *
 * URLs are built off APP_URL (or NEXTAUTH_URL as a fallback for hosts
 * that already set it for Auth.js). Tokens are URL-safe (base64url) so
 * direct concatenation with ?token= is safe.
 *
 * IMPORTANT: never log the raw token. Logs include only userId + a
 * truncated hash prefix for debugging.
 */

import {
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  issueAuthToken,
} from "@/lib/auth-tokens";
import { sendEmail } from "@/lib/email";
import {
  emailVerifyEmail,
  passwordResetEmail,
  type AuthEmailUser,
} from "@/lib/email-templates";

function appBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  // Strip a trailing slash so we always concatenate cleanly.
  return raw.replace(/\/+$/, "") || "https://ratemedrafts.com";
}

export async function issueAndSendVerify(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const { rawToken, tokenHash } = await issueAuthToken(
    user.id,
    "email-verify",
    EMAIL_VERIFY_TTL_MS,
  );
  const url = `${appBaseUrl()}/verify-email?token=${rawToken}`;
  const result = await sendEmail(
    emailVerifyEmail({ name: user.name, email: user.email } satisfies AuthEmailUser, url),
  );
  if (!result.ok) {
    // Log only the hash prefix — never the raw token.
    console.warn(
      `[auth-emails] verify email send failed userId=${user.id} hash=${tokenHash.slice(0, 8)} error=${result.error}`,
    );
  }
}

export async function issueAndSendReset(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const { rawToken, tokenHash } = await issueAuthToken(
    user.id,
    "password-reset",
    PASSWORD_RESET_TTL_MS,
  );
  const url = `${appBaseUrl()}/reset-password?token=${rawToken}`;
  const result = await sendEmail(
    passwordResetEmail({ name: user.name, email: user.email } satisfies AuthEmailUser, url),
  );
  if (!result.ok) {
    console.warn(
      `[auth-emails] reset email send failed userId=${user.id} hash=${tokenHash.slice(0, 8)} error=${result.error}`,
    );
  }
}
