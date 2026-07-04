import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "VERITAS — The AI Forensic Auditor",
  description: "Reads 100% of the books. Finds fraud in minutes.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body style={{ fontFamily: "Figtree, system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
