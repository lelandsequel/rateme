"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "accept" | "decline" | "leave";

export function MembershipAction({
  id,
  actions,
}: {
  id: string;
  actions: Action[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fire(action: Action) {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/team/memberships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Failed");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error");
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <button
          key={a}
          onClick={() => fire(a)}
          disabled={busy !== null}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
            a === "accept"
              ? "bg-[#7adfaf] text-[#0b1326] hover:bg-[#7adfaf]/80"
              : a === "decline"
                ? "bg-[#f5867a] text-[#0b1326] hover:bg-[#f5867a]/80"
                : "bg-[#131b2e] text-[#c6c5d4] border border-[#2d3449] hover:bg-[#2d3449]/40"
          }`}
        >
          {busy === a ? "…" : a}
        </button>
      ))}
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}
