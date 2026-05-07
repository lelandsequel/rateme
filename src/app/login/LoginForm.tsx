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
        <label htmlFor="email" className="block text-xs text-[#c6c5d4] mb-1">
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
          className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449] focus:outline-none focus:ring-1 focus:ring-[#bbc3ff]/40"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs text-[#c6c5d4] mb-1">
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
          className="w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449] focus:outline-none focus:ring-1 focus:ring-[#bbc3ff]/40"
        />
      </div>

      {formError && (
        <div className="text-sm text-red-400 bg-[#93000a]/10 border border-[#93000a]/30 rounded-lg px-3 py-2">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#bbc3ff] text-[#0b1326] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-xs text-[#c6c5d4]/70 text-center pt-2">
        <Link href="/forgot-password" className="text-[#bbc3ff] hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
