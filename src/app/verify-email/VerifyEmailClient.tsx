"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Props {
  token: string;
}

type Status =
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

/**
 * Verify-email client. Fires a single POST to /api/auth/verify-email on
 * mount and shows success or the server's error message. Uses a ref guard
 * so React 19 strict-mode double-mounts don't double-consume tokens (which
 * would always succeed once and fail once → confusing UX).
 */
export function VerifyEmailClient({ token }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "pending" });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token) {
      setStatus({
        kind: "error",
        message: "Missing verification token in the URL.",
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus({ kind: "success" });
        } else {
          let msg = "Verification failed.";
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) msg = body.error;
          } catch {
            // ignore
          }
          setStatus({ kind: "error", message: msg });
        }
      } catch {
        if (!cancelled) {
          setStatus({ kind: "error", message: "Network error." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status.kind === "pending") {
    return (
      <p className="text-sm text-[#475569]">Verifying your email…</p>
    );
  }

  if (status.kind === "success") {
    return (
      <div className="space-y-4">
        <div className="text-sm text-[#0f172a] bg-[#fecaca] border border-[#fecaca] rounded-lg px-3 py-3">
          Email verified. You're all set.
        </div>
        <Link
          href="/login"
          className="block text-center w-full bg-[#dc2626] text-[#ffffff] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#b91c1c] transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-[#dc2626] bg-[#fee2e2] border border-[#fecaca] rounded-lg px-3 py-2">
        {status.message}
      </div>
      <Link
        href="/login"
        className="block text-center w-full bg-[#1c2238] text-[#0f172a] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#222b48] transition-colors border border-[#e5e7eb]"
      >
        Back to sign in
      </Link>
    </div>
  );
}
