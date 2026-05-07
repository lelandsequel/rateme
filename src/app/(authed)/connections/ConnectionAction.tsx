"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "accept" | "reject" | "disconnect";

export function ConnectionAction({ id, actions }: { id: string; actions: Action[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fire(action: Action) {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/connections/${id}`, {
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
              ? "bg-[#16a34a] text-[#ffffff] hover:bg-[#16a34a]/80"
              : a === "reject"
                ? "bg-[#dc2626] text-white hover:bg-[#b91c1c]"
                : "bg-[#ffffff] text-[#475569] border border-[#e5e7eb] hover:bg-[#f1f5f9]"
          }`}
        >
          {busy === a ? "…" : a}
        </button>
      ))}
      {err && <span className="text-[10px] text-[#dc2626]">{err}</span>}
    </div>
  );
}
