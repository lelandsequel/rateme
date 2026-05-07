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
    <div className="min-h-screen flex items-center justify-center bg-[#0b1326] p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#001d92] flex items-center justify-center">
              <span className="text-[#bbc3ff] text-xl font-bold">R</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter text-[#dae2fd] font-headline">
              Rate Me
            </h1>
          </Link>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-8 border border-[#171f33]/50">
          <h2 className="text-xl font-headline font-bold text-[#dae2fd] mb-1">
            Verify your email
          </h2>
          <VerifyEmailClient token={token ?? ""} />
        </div>
      </div>
    </div>
  );
}
