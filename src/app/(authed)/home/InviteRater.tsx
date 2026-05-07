"use client";

import { useState } from "react";

export function InviteRater() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setLink(null);
    setCopied(false);
    try {
      const res = await fetch("/api/rating-requests/one-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Failed");
        setBusy(false);
        return;
      }
      const absolute =
        typeof window !== "undefined"
          ? `${window.location.origin}${body.inviteUrl}`
          : body.inviteUrl;
      setLink(absolute);
      setEmail("");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-[#ffffff] rounded-xl border border-[#e5e7eb] p-6">
      <h2 className="font-bold mb-1">Invite a rater</h2>
      <p className="text-sm text-[#475569] mb-4">
        Send a one-time link to a customer. They&apos;ll sign up + rate in one flow.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="customer@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-[#ffffff] border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm placeholder-[#94a3b8]"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="px-4 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c] disabled:opacity-50"
        >
          {busy ? "Sending…" : "INVITE OTHERS"}
        </button>
      </form>

      {err && <div className="text-sm text-[#dc2626] mt-3">{err}</div>}

      {link && (
        <div className="mt-4 text-sm">
          <div className="text-[#16a34a]">Invite created.</div>
          <div className="mt-2 flex gap-2 items-center">
            <input
              readOnly
              value={link}
              className="flex-1 bg-[#ffffff] border border-[#e5e7eb] rounded-lg px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-2 rounded-lg bg-[#ffffff] border border-[#e5e7eb] text-xs hover:bg-[#f1f5f9]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
