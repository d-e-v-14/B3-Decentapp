import type { Metadata } from "next";
import "./globals_clean.css";
// import Providers from "./providers";

export const metadata: Metadata = {
  title: "B3 DecentApp",
  description: "Solana-native authentication and key management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-black text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
