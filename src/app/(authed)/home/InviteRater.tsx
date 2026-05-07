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
    <div className="bg-[#131b2e] rounded-xl border border-[#171f33]/50 p-6">
      <h2 className="font-bold mb-1">Invite a rater</h2>
      <p className="text-sm text-[#c6c5d4] mb-4">
        Send a one-time link to a customer. They&apos;ll sign up + rate in one flow.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="customer@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-[#0b1326] border border-[#2d3449] rounded-lg px-3 py-2 text-sm placeholder-[#9da4c1]"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="px-4 py-2 rounded-lg bg-[#bbc3ff] text-[#0b1326] font-medium text-sm hover:bg-[#bbc3ff]/80 disabled:opacity-50"
        >
          {busy ? "Sending…" : "INVITE OTHERS"}
        </button>
      </form>

      {err && <div className="text-sm text-red-400 mt-3">{err}</div>}

      {link && (
        <div className="mt-4 text-sm">
          <div className="text-[#7adfaf]">Invite created.</div>
          <div className="mt-2 flex gap-2 items-center">
            <input
              readOnly
              value={link}
              className="flex-1 bg-[#0b1326] border border-[#2d3449] rounded-lg px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-2 rounded-lg bg-[#131b2e] border border-[#2d3449] text-xs hover:bg-[#2d3449]/40"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
