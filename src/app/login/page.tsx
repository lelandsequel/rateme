import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ffffff] p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#dc2626] flex items-center justify-center">
              <span className="text-white text-xl font-bold">R</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter text-[#0f172a]">
              RateMyRep
            </h1>
          </Link>
          <p className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
            The rep rating marketplace
          </p>
        </div>

        <div className="bg-[#ffffff] rounded-xl p-8 border border-[#e5e7eb]">
          <h2 className="text-xl font-bold text-[#0f172a] mb-1">Sign in</h2>
          <p className="text-sm text-[#475569] mb-6">Welcome back.</p>
          <LoginFormWrapper searchParams={searchParams} />

          <p className="text-xs text-[#94a3b8] text-center mt-6">
            New here?{" "}
            <Link href="/signup" className="text-[#dc2626] hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        <p className="text-xs text-[#94a3b8] text-center mt-6">
          Demo: tj@ratemyrep.com / demo123
        </p>
      </div>
    </div>
  );
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return <LoginForm callbackUrl={callbackUrl ?? "/home"} error={error} />;
}
