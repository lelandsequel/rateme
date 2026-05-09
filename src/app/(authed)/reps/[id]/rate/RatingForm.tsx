"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COMMENT_MAX = 500;

export interface RatingFormQuestion {
  id: string;
  key: string;
  ord: number;
  labelEn: string;
  labelEs: string;
  labelPt: string;
}

export function RatingForm({
  repUserId,
  questions,
  ratingRequestId,
  redirectAfter,
}: {
  repUserId: string;
  questions: ReadonlyArray<RatingFormQuestion>;
  ratingRequestId?: string;
  redirectAfter?: string;
}) {
  const router = useRouter();
  // Default every question to 4 (the most common "I had a fine time" baseline).
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const q of questions) init[q.key] = 4;
    return init;
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Headline overall (0-10) — live mean of submitted scores * 2.
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const overall = questions.length === 0 ? 0 : sum / questions.length;
  const overall10 = Math.round(overall * 2 * 100) / 100;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      if (trimmed.length > COMMENT_MAX) {
        setErr(`Comment must be ${COMMENT_MAX} characters or fewer.`);
        setSubmitting(false);
        return;
      }
      const payload: Record<string, unknown> = {
        repUserId,
        answers: questions.map((q) => ({ questionKey: q.key, score: scores[q.key] })),
      };
      if (ratingRequestId) payload.ratingRequestId = ratingRequestId;
      if (trimmed.length > 0) payload.comment = trimmed;
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Submit failed");
        setSubmitting(false);
        return;
      }
      setDone(true);
      const target = redirectAfter ?? `/reps/${repUserId}`;
      setTimeout(() => {
        router.push(target);
        router.refresh();
      }, 800);
    } catch {
      setErr("Network error");
      setSubmitting(false);
    }
  }

  if (done) {
    return <div className="text-[#16a34a] font-medium">Rating submitted ✓</div>;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Overall
          </div>
          <div className="text-[28px] font-bold text-[#0f172a] leading-tight">
            <span className="text-[#fbbf24] mr-1">★</span>
            {overall10.toFixed(2)}
            <span className="text-sm text-[#94a3b8] font-normal"> / 10</span>
          </div>
        </div>
        <div className="text-xs text-[#94a3b8] max-w-[200px] text-right">
          Auto-derived from your {questions.length} ratings below
        </div>
      </div>

      {questions.map((q) => (
        <div key={q.key}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[#0f172a]">{q.labelEn}</span>
            <span className="text-[#dc2626] font-semibold">{scores[q.key]}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={scores[q.key]}
            onChange={(e) => setScores({ ...scores, [q.key]: Number(e.target.value) })}
            className="w-full accent-[#dc2626]"
          />
          <div className="flex justify-between text-[10px] text-[#94a3b8] mt-1">
            <span>1 · poor</span><span>2</span><span>3</span><span>4</span><span>5 · excellent</span>
          </div>
        </div>
      ))}

      <div className="border-t border-[#e5e7eb] pt-4">
        <label className="block text-sm text-[#0f172a] mb-1.5">
          Comment <span className="text-[#94a3b8] text-xs">(optional)</span>
        </label>
        <textarea
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment about this rep"
          rows={3}
          className="w-full bg-white border border-[#e5e7eb] rounded-lg p-3 text-sm text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:border-[#dc2626]"
        />
        <div className="flex justify-end text-[11px] text-[#94a3b8] mt-1">
          {comment.length}/{COMMENT_MAX}
        </div>
      </div>

      {err && <div className="text-sm text-[#dc2626]">{err}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#dc2626] text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-[#b91c1c] disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit rating"}
      </button>
    </form>
  );
}
