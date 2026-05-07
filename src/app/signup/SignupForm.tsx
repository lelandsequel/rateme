"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

type Role = "REP" | "RATER" | "SALES_MANAGER" | "RATER_MANAGER";

const ROLE_LABEL: Record<Role, string> = {
  REP: "Sales Rep",
  RATER: "Rater (customer / buyer)",
  SALES_MANAGER: "Sales Manager (manages reps)",
  RATER_MANAGER: "Rater Manager (manages raters)",
};

interface Industry { slug: string; name: string }

export function SignupForm({ industries }: { industries: Industry[] }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("REP");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState("TX");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [industrySlug, setIndustrySlug] = useState(industries[0]?.slug ?? "saas");
  const [metroArea, setMetroArea] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsProfile = role === "REP" || role === "RATER";
  const needsCompanyOnly = role === "SALES_MANAGER" || role === "RATER_MANAGER";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          role,
          state,
          ...(needsProfile ? { title, company, industrySlug } : {}),
          ...(needsCompanyOnly ? { company } : {}),
          ...(role === "REP" && metroArea ? { metroArea } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Signup failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      // Hand off to next-auth so the cookie session is established for web.
      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        setError("Account created, but auto-login failed. Try signing in.");
        setSubmitting(false);
        return;
      }
      // Hard navigation — see LoginForm for why router.push isn't enough.
      window.location.assign("/home");
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="I am a">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={inputClass}
        >
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </Field>

      <Field label="Full name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Jane Doe"
        />
      </Field>

      <Field label="Email">
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@company.com"
        />
      </Field>

      <Field label="Password">
        <input
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="At least 8 characters"
        />
      </Field>

      <Field label="State">
        <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      {(needsProfile || needsCompanyOnly) && (
        <Field label="Company">
          <input
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={inputClass}
            placeholder="Your employer"
          />
        </Field>
      )}

      {needsProfile && (
        <>
          <Field label="Title">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder={role === "REP" ? "Account Executive" : "VP of Procurement"}
            />
          </Field>
          <Field label="Industry">
            <select
              value={industrySlug}
              onChange={(e) => setIndustrySlug(e.target.value)}
              className={inputClass}
            >
              {industries.map((i) => (
                <option key={i.slug} value={i.slug}>{i.name}</option>
              ))}
            </select>
          </Field>
        </>
      )}

      {role === "REP" && (
        <Field label="Metro area (optional)">
          <input
            value={metroArea}
            onChange={(e) => setMetroArea(e.target.value)}
            className={inputClass}
            placeholder="Houston, TX"
          />
        </Field>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-[#93000a]/10 border border-[#93000a]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#bbc3ff] text-[#0b1326] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full bg-[#0b1326] text-[#dae2fd] px-3 py-2 rounded-lg border border-[#2d3449] focus:outline-none focus:ring-1 focus:ring-[#bbc3ff]/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#c6c5d4] mb-1">{label}</label>
      {children}
    </div>
  );
}
