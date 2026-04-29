"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="bg-[#131b2e] rounded-xl p-8 border border-[#93000a]/30 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-[#93000a]/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <h2 className="text-xl font-headline font-bold text-[#dae2fd] mb-2">Something went wrong</h2>
        <p className="text-sm text-[#c6c5d4] mb-6">{error.message || "An unexpected error occurred."}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#bbc3ff] text-[#0b1326] rounded-lg font-medium text-sm hover:bg-[#bbc3ff]/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
