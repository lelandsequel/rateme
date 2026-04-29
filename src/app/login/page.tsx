import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1326] p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#001d92] flex items-center justify-center">
              <span className="text-[#bbc3ff] text-xl font-bold">R</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter text-[#dae2fd] font-headline">
              Rate Me
            </h1>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-[#c6c5d4]/70">
            Enterprise Intelligence
          </p>
        </div>

        <div className="bg-[#131b2e] rounded-xl p-8 border border-[#171f33]/50">
          <h2 className="text-xl font-headline font-bold text-[#dae2fd] mb-1">
            Sign in
          </h2>
          <p className="text-sm text-[#c6c5d4] mb-6">
            Use your Rate Me workspace credentials.
          </p>
          <LoginFormWrapper searchParams={searchParams} />
        </div>

        <p className="text-xs text-[#c6c5d4]/50 text-center mt-6">
          Demo seed: admin@demo.com / demo123
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
  return <LoginForm callbackUrl={callbackUrl ?? "/"} error={error} />;
}
