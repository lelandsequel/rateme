"use client";

// Heart toggle that flips a Favorite on/off for the current rater.
// Filled = favorited, outline = not. Optimistically updates so the click
// feels instant; rolls back on a non-2xx response.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  repUserId: string;
  initialFavorited: boolean;
  /** Optional size variant — small for cards, larger for the detail page. */
  size?: "sm" | "md";
}

export function FavoriteToggle({ repUserId, initialFavorited, size = "md" }: Props) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function toggle(e: React.MouseEvent) {
    // Heart can sit inside a parent <Link> (rep card). Prevent navigation.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !favorited;
    setFavorited(next);
    setErr(null);

    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ repUserId }),
            })
          : await fetch(`/api/favorites/${encodeURIComponent(repUserId)}`, {
              method: "DELETE",
            });
        if (!res.ok) {
          // Roll back optimistic flip.
          setFavorited(!next);
          const body = await res.json().catch(() => ({}));
          setErr(body.error ?? "Couldn't update favorite");
          return;
        }
        router.refresh();
      } catch {
        setFavorited(!next);
        setErr("Network error");
      }
    });
  }

  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      title={favorited ? "Favorited — click to remove" : "Add to favorites"}
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition ${
        favorited
          ? "text-[#f5867a] hover:text-[#f5867a]/80"
          : "text-[#9da4c1] hover:text-[#dae2fd]"
      } disabled:opacity-50`}
    >
      <svg
        viewBox="0 0 24 24"
        className={dim}
        fill={favorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {err && <span className="ml-1 text-xs text-red-400">{err}</span>}
    </button>
  );
}
