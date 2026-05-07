"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  token: string;
}

/**
 * Reset-password form. Posts {token, newPassword} to /api/auth/reset-password.
 * On 200 swaps to a success card with a link back to /login. On error shows
 * the server's message (which is intentionally generic) so the user can
 * decide whether to request a fresh link.
 */
export function ResetPasswordForm({ token }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid reset token. Request a new link.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        let msg = "Reset failed.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) msg = body.error;
        } catch {
          // ignore
        }
        setError(msg);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-[#dae2fd] bg-[#001d92]/30 border border-[#001d92]/50 rounded-lg px-3 py-3">
          Password updated.
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="newPassword"
          className="block text-xs text-[#c6c5d4] mb-1"
        >
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449] focus:outline-none focus:ring-1 focus:ring-[#bbc3ff]/40"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-xs text-[#c6c5d4] mb-1">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449] focus:outline-none focus:ring-1 focus:ring-[#bbc3ff]/40"
        />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-[#93000a]/10 border border-[#93000a]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !token}
        className="w-full bg-[#bbc3ff] text-[#0b1326] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors disabled:opacity-50"
      >
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
