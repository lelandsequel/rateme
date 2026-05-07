// Landing page — placeholder during the RMR pivot build.
//
// Single-screen hero with a sign-in link. Once Phase 3 (web UI) lands
// this becomes the marketing page and authenticated users redirect to
// /home (or wherever their role-specific dashboard lives).

import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-[#dc2626]">
          RateMyRep
        </h1>
        <p className="mt-4 text-lg text-[#94a3b8]">
          The rep rating marketplace — your reputation, owned by you.
        </p>
        <p className="mt-2 text-sm text-[#6a7390]">
          Currently rebuilding. Sign in to test the new platform.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-[#dc2626] px-6 py-3 font-medium text-[#ffffff] hover:bg-[#a5aef0]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
