"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DIMENSIONS = [
  { key: "responsiveness", label: "Responsiveness" },
  { key: "productKnowledge", label: "Product knowledge" },
  { key: "followThrough", label: "Follow-through" },
  { key: "listeningNeedsFit", label: "Listening / needs fit" },
  { key: "trustIntegrity", label: "Trust / integrity" },
] as const;

type DimKey = (typeof DIMENSIONS)[number]["key"];

export function RatingForm({ repUserId }: { repUserId: string }) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<DimKey, number>>({
    responsiveness: 4,
    productKnowledge: 4,
    followThrough: 4,
    listeningNeedsFit: 4,
    trustIntegrity: 4,
  });
  const [takeCallAgain, setTakeCallAgain] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repUserId, ...scores, takeCallAgain }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Submit failed");
        setSubmitting(false);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push(`/reps/${repUserId}`);
        router.refresh();
      }, 800);
    } catch {
      setErr("Network error");
      setSubmitting(false);
    }
  }

  if (done) {
    return <div className="text-[#7adfaf]">Rating submitted ✓</div>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 bg-[#131b2e] p-6 rounded-xl border border-[#171f33]/50">
      {DIMENSIONS.map((d) => (
        <div key={d.key}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[#dae2fd]">{d.label}</span>
            <span className="text-[#bbc3ff] font-medium">{scores[d.key]}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={scores[d.key]}
            onChange={(e) => setScores({ ...scores, [d.key]: Number(e.target.value) })}
            className="w-full accent-[#bbc3ff]"
          />
          <div className="flex justify-between text-[10px] text-[#9da4c1] mt-1">
            <span>1 · poor</span><span>2</span><span>3</span><span>4</span><span>5 · excellent</span>
          </div>
        </div>
      ))}

      <div className="border-t border-[#2d3449] pt-4">
        <label className="flex items-center justify-between text-sm">
          <span className="text-[#dae2fd]">Would you take their call again?</span>
          <input
            type="checkbox"
            checked={takeCallAgain}
            onChange={(e) => setTakeCallAgain(e.target.checked)}
            className="w-5 h-5 accent-[#bbc3ff]"
          />
        </label>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#bbc3ff] text-[#0b1326] px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit rating"}
      </button>
    </form>
  );
}
