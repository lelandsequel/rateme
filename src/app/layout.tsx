import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RateMyRep",
  description: "The rep rating marketplace — your reputation, owned by you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-[#0f172a]">{children}</body>
    </html>
  );
}
