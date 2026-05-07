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
      <p className="text-sm text-[#c6c5d4]">Verifying your email…</p>
    );
  }

  if (status.kind === "success") {
    return (
      <div className="space-y-4">
        <div className="text-sm text-[#dae2fd] bg-[#001d92]/30 border border-[#001d92]/50 rounded-lg px-3 py-3">
          Email verified. You're all set.
        </div>
        <Link
          href="/login"
          className="block text-center w-full bg-[#bbc3ff] text-[#0b1326] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-red-400 bg-[#93000a]/10 border border-[#93000a]/30 rounded-lg px-3 py-2">
        {status.message}
      </div>
      <Link
        href="/login"
        className="block text-center w-full bg-[#1c2238] text-[#dae2fd] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#222b48] transition-colors border border-[#2d3449]"
      >
        Back to sign in
      </Link>
    </div>
  );
}
