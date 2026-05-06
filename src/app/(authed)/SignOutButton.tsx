"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-[#c6c5d4] hover:text-[#dae2fd] underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}
