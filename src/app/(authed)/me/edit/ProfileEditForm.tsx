"use client";

import { useState } from "react";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

interface Industry { slug: string; name: string }

interface InitialValues {
  role: "REP" | "RATER" | "SALES_MANAGER" | "RATER_MANAGER" | "ADMIN";
  name: string;
  state: string;
  title: string;
  company: string;
  industrySlug: string;
  metroArea: string;
}

export function ProfileEditForm({
  industries,
  initial,
}: {
  industries: Industry[];
  initial: InitialValues;
}) {
  const [name, setName] = useState(initial.name);
  const [state, setState] = useState(initial.state);
  const [title, setTitle] = useState(initial.title);
  const [company, setCompany] = useState(initial.company);
  const [industrySlug, setIndustrySlug] = useState(
    initial.industrySlug || industries[0]?.slug || "",
  );
  const [metroArea, setMetroArea] = useState(initial.metroArea);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = initial.role;
  const needsProfile = role === "REP" || role === "RATER";
  const needsCompanyOnly = role === "SALES_MANAGER" || role === "RATER_MANAGER";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name, state };
      if (needsProfile) {
        body.title = title;
        body.company = company;
        body.industrySlug = industrySlug;
      }
      if (needsCompanyOnly) {
        body.company = company;
      }
      if (role === "REP") {
        body.metroArea = metroArea === "" ? null : metroArea;
      }
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Update failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      window.location.assign("/me");
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Full name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Jane Doe"
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
        {submitting ? "Saving…" : "Save changes"}
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
