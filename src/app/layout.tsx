import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMP Application Tracker",
  description: "Special Master's Programs application tracking dashboard",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%230969da%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/><path d=%22M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20%22/><path d=%22M2 12h20%22/></svg>",
  },
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
