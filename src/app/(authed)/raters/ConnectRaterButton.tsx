"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectRaterButton({ raterUserId }: { raterUserId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUserId: raterUserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Failed");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium hover:bg-[#b91c1c] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Connect"}
      </button>
      {err && <span className="text-[10px] text-[#dc2626] max-w-[140px] text-right">{err}</span>}
    </div>
  );
}
