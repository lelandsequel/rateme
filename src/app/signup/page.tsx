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
    <div className="min-h-screen flex items-center justify-center bg-[#0b1326] p-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#001d92] flex items-center justify-center">
              <span className="text-[#bbc3ff] text-xl font-bold">R</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter text-[#dae2fd]">
              RateMyRep
            </h1>
          </Link>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-8 border border-[#171f33]/50">
          <h2 className="text-xl font-bold text-[#dae2fd] mb-1">Create account</h2>
          <p className="text-sm text-[#c6c5d4] mb-6">
            Pick what you are. We'll set the rest up.
          </p>
          <SignupForm industries={industries} />

          <p className="text-xs text-[#c6c5d4]/70 text-center mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-[#bbc3ff] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
