"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

interface Props {
  callbackUrl?: string;
  error?: string;
}

export function LoginForm({ callbackUrl = "/home", error }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    error ? "Invalid email or password." : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setFormError("Invalid email or password.");
        setSubmitting(false);
        return;
      }
      // Hard navigation — router.push(...) sometimes fires before the
      // browser commits the auth cookie set by the credentials callback,
      // which sends auth() back null on the next page and loops to /login.
      window.location.assign(callbackUrl);
    } catch {
      setFormError("Sign-in failed. Please try again.");
      setSubmitting(false);
    }
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

      <div>
        <label htmlFor="password" className="block text-xs text-[#475569] mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-[#ffffff] text-[#0f172a] px-3 py-2 rounded-lg border border-[#e5e7eb] focus:outline-none focus:ring-1 focus:ring-[#dc2626]/40"
        />
      </div>

      {formError && (
        <div className="text-sm text-[#dc2626] bg-[#fee2e2] border border-[#fecaca] rounded-lg px-3 py-2">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#dc2626] text-[#ffffff] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-xs text-[#94a3b8] text-center pt-2">
        <Link href="/forgot-password" className="text-[#dc2626] hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
