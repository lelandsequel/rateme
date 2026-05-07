import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { prisma } from "@/lib/prisma";
import { HAS_DB } from "@/lib/env";
import { INDUSTRIES_V1 } from "@/lib/industries";

export const dynamic = "force-dynamic";

async function loadIndustries() {
  if (!HAS_DB) return INDUSTRIES_V1.map((i) => ({ slug: i.slug, name: i.name }));
  const rows = await prisma.industry.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
  return rows;
}

export default async function SignupPage() {
  const industries = await loadIndustries();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ffffff] p-6 py-12">
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
        </div>

        <div className="bg-[#ffffff] rounded-xl p-8 border border-[#e5e7eb]">
          <h2 className="text-xl font-bold text-[#0f172a] mb-1">Create account</h2>
          <p className="text-sm text-[#475569] mb-6">
            Pick what you are. We'll set the rest up.
          </p>
          <SignupForm industries={industries} />

          <p className="text-xs text-[#94a3b8] text-center mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-[#dc2626] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
