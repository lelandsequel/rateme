"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface InviteResult {
  created: Array<{ memberId: string; email: string }>;
  skipped: Array<{ email: string; reason: string }>;
}

export function InviteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setResult(null);

    const memberEmails = text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (memberEmails.length === 0) {
      setErr("Enter at least one email");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberEmails }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<InviteResult> & {
        error?: string;
      };
      if (!res.ok) {
        setErr(body.error ?? "Failed to send invites");
        setBusy(false);
        return;
      }
      setResult({
        created: body.created ?? [],
        skipped: body.skipped ?? [],
      });
      if ((body.created ?? []).length > 0) {
        setText("");
        router.refresh();
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="One email per line, or comma-separated"
        className="w-full bg-[#131b2e] border border-[#2d3449] rounded-lg p-3 text-sm text-[#dae2fd] placeholder:text-[#9da4c1]/60 focus:outline-none focus:border-[#bbc3ff]"
        disabled={busy}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="text-sm px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium hover:bg-[#bbc3ff]/80 disabled:opacity-50"
        >
          {busy ? "Sending..." : "Send invites"}
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>

      {result && (
        <div className="mt-2 space-y-2 text-xs">
          {result.created.length > 0 && (
            <div className="text-[#7adfaf]">
              Invited {result.created.length}: {result.created.map((c) => c.email).join(", ")}
            </div>
          )}
          {result.skipped.length > 0 && (
            <ul className="space-y-1 text-[#f5c97a]">
              {result.skipped.map((s) => (
                <li key={s.email}>
                  Skipped {s.email}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
