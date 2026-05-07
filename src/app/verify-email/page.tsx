import Link from "next/link";
import { VerifyEmailClient } from "./VerifyEmailClient";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ffffff] p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#dc2626] flex items-center justify-center">
              <span className="text-white text-xl font-bold">R</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter text-[#0f172a] font-headline">
              Rate Me
            </h1>
          </Link>
        </div>

        <div className="bg-[#ffffff] rounded-xl p-8 border border-[#e5e7eb]">
          <h2 className="text-xl font-headline font-bold text-[#0f172a] mb-1">
            Verify your email
          </h2>
          <VerifyEmailClient token={token ?? ""} />
        </div>
      </div>
    </div>
  );
}
