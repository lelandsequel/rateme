"use client";

// Copy-to-clipboard button for the rep's shareable public profile URL.
//
// Renders only when the viewer IS the rep being shown (controlled by the
// parent server component). The link points at /public/reps/[id] which is
// the no-auth-required preview page.

import { useState } from "react";

export function PublicLinkButton({ repId }: { repId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const path = `/public/reps/${repId}`;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API blocked; fall back to opening the link in a new tab.
      window.open(path, "_blank", "noopener");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="px-3 py-1.5 rounded-lg bg-[#131b2e] border border-[#2d3449] text-xs text-[#c6c5d4] hover:text-[#dae2fd]"
      title="Copy your shareable public profile link"
    >
      {copied ? "Link copied" : "Copy public link"}
    </button>
  );
}
