import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// Public page — no session check.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
            Reset your password
          </h2>
          <p className="text-sm text-[#c6c5d4] mb-6">
            Enter the email on your account and we'll send you a reset link.
          </p>
          <ForgotPasswordForm />

          <p className="text-xs text-[#c6c5d4]/70 text-center mt-6">
            Remembered it?{" "}
            <Link href="/login" className="text-[#bbc3ff] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
