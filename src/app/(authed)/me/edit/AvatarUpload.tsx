"use client";

import { useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function AvatarUpload({
  initialAvatarUrl,
  userName,
}: {
  initialAvatarUrl: string | null;
  userName: string;
}) {
  const [preview, setPreview] = useState<string | null>(initialAvatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setError("File must be PNG, JPEG, or WebP.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File must be 2MB or smaller.");
      setFile(null);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Upload failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setSuccess("Avatar updated.");
      // Reload so the layout picks up the new avatar.
      window.location.reload();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  const initial = (userName?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Avatar preview"
            className="w-20 h-20 rounded-full object-cover border border-[#2d3449] bg-[#0b1326]"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#001d92] flex items-center justify-center text-[#bbc3ff] text-2xl font-bold">
            {initial}
          </div>
        )}
        <div className="flex-1">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPick}
            className="block text-sm text-[#c6c5d4] file:mr-3 file:rounded-md file:border-0 file:bg-[#2d3449] file:px-3 file:py-1.5 file:text-[#dae2fd] hover:file:bg-[#3a4262]"
          />
          <p className="text-xs text-[#9da4c1] mt-1">PNG, JPEG, or WebP. Max 2MB.</p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-[#93000a]/10 border border-[#93000a]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-emerald-300 bg-emerald-900/10 border border-emerald-700/30 rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!file || submitting}
        className="bg-[#bbc3ff] text-[#0b1326] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Upload avatar"}
      </button>
    </div>
  );
}
