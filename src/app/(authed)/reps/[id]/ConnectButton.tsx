"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectButton({ repUserId, label = "Request connection" }: { repUserId: string; label?: string }) {
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
        body: JSON.stringify({ otherUserId: repUserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Connection failed");
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
    <div className="flex flex-col gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c] disabled:opacity-50"
      >
        {busy ? "Sending…" : label}
      </button>
      {err && <span className="text-xs text-[#dc2626]">{err}</span>}
    </div>
  );
}
