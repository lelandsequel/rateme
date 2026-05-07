import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// Public page — no session check.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
            Reset your password
          </h2>
          <p className="text-sm text-[#475569] mb-6">
            Enter the email on your account and we'll send you a reset link.
          </p>
          <ForgotPasswordForm />

          <p className="text-xs text-[#94a3b8] text-center mt-6">
            Remembered it?{" "}
            <Link href="/login" className="text-[#dc2626] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
