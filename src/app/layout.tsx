import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMP Application Tracker",
  description: "Direct Google Sheets powered Special Master's Programs application tracking dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
