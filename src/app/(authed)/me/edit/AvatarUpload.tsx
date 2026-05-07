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
            className="w-20 h-20 rounded-full object-cover border border-[#e5e7eb] bg-[#ffffff]"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#e2e8f0] flex items-center justify-center text-[#0f172a] text-2xl font-bold">
            {initial}
          </div>
        )}
        <div className="flex-1">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPick}
            className="block text-sm text-[#475569] file:mr-3 file:rounded-md file:border-0 file:bg-[#e5e7eb] file:px-3 file:py-1.5 file:text-[#0f172a] hover:file:bg-[#cbd5e1]"
          />
          <p className="text-xs text-[#94a3b8] mt-1">PNG, JPEG, or WebP. Max 2MB.</p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-[#dc2626] bg-[#fee2e2] border border-[#fecaca] rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-[#166534] bg-[#dcfce7] border border-[#bbf7d0] rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!file || submitting}
        className="bg-[#dc2626] text-[#ffffff] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Upload avatar"}
      </button>
    </div>
  );
}
