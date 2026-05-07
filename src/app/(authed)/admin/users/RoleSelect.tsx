"use client";

// Inline role-changer for the admin users table. PATCHes
// /api/admin/users/[id] then refreshes the route to pick up new data.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ROLES = [
  "REP",
  "RATER",
  "SALES_MANAGER",
  "RATER_MANAGER",
  "ADMIN",
] as const;

export function RoleSelect({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === currentRole) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setErr(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        defaultValue={currentRole}
        onChange={onChange}
        disabled={busy || pending}
        className="bg-[#ffffff] border border-[#e5e7eb] rounded px-2 py-1 text-xs text-[#0f172a] disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {err && <span className="text-xs text-[#f5867a]">{err}</span>}
    </span>
  );
}
