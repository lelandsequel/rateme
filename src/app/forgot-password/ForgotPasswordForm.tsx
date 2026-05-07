"use client";

import { useState } from "react";

/**
 * Forgot-password form. Always shows the same success message after a
 * submit so we don't reveal which email addresses are registered.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Even on transport errors we show success to avoid leaking
      // existence info via timing or error states.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="text-sm text-[#0f172a] bg-[#fecaca] border border-[#fecaca] rounded-lg px-3 py-3">
        If an account exists for that email, a reset link is on the way.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs text-[#475569] mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-[#ffffff] text-[#0f172a] px-3 py-2 rounded-lg border border-[#e5e7eb] focus:outline-none focus:ring-1 focus:ring-[#dc2626]/40"
          placeholder="you@company.com"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#dc2626] text-[#ffffff] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
