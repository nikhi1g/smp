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
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
