"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RaterOption {
  userId: string;
  title: string;
  company: string;
  industry: string;
}

export function OnBehalfRequest({
  forRepUserId,
  raters,
}: {
  forRepUserId: string;
  raters: RaterOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(raters[0]?.userId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  if (raters.length === 0) {
    return (
      <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 p-6">
        <h3 className="font-bold mb-1">Request a rating on behalf</h3>
        <p className="text-sm text-[#c6c5d4]">
          This rep doesn&apos;t have any accepted connections yet.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setErr(null);
    setRetryAfter(null);
    setDone(false);
    try {
      const res = await fetch("/api/rating-requests/on-behalf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forRepUserId,
          toRaterUserId: selected,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Failed");
        if (typeof body.retryAfterDays === "number") {
          setRetryAfter(body.retryAfterDays);
        }
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 p-6">
      <h3 className="font-bold mb-1">Request a rating on behalf</h3>
      <p className="text-sm text-[#c6c5d4] mb-4">
        Pick a connected rater. They&apos;ll get a one-time prompt.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 bg-[#0b1326] border border-[#2d3449] rounded-lg px-3 py-2 text-sm"
        >
          {raters.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.title} · {r.company} · {r.industry}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !selected}
          className="px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Request rating"}
        </button>
      </form>
      {err && (
        <div className="text-sm text-red-400 mt-3">
          {err}
          {retryAfter !== null && (
            <> · Try again in ~{retryAfter} day{retryAfter === 1 ? "" : "s"}.</>
          )}
        </div>
      )}
      {done && <div className="text-sm text-[#7adfaf] mt-3">Request sent.</div>}
    </div>
  );
}
