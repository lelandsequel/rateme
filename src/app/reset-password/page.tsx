import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
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
            Set a new password
          </h2>
          <p className="text-sm text-[#c6c5d4] mb-6">
            Pick something at least 8 characters long.
          </p>
          <ResetPasswordForm token={token ?? ""} />
        </div>
      </div>
    </div>
  );
}
