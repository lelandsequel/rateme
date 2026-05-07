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
            Set a new password
          </h2>
          <p className="text-sm text-[#475569] mb-6">
            Pick something at least 8 characters long.
          </p>
          <ResetPasswordForm token={token ?? ""} />
        </div>
      </div>
    </div>
  );
}
