import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FactorRush",
  description: "Invite-only realtime number party game"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
