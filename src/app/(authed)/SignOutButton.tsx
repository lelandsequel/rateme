"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-[#475569] hover:text-[#0f172a] underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}
