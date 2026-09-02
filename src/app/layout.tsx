import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMP Application Tracker",
  description: "Special Master's Programs application tracking dashboard",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22 fill=%22none%22><circle cx=%2216%22 cy=%2216%22 r=%2214%22 fill=%22%230969da%22/><ellipse cx=%2216%22 cy=%2216%22 rx=%226%22 ry=%2214%22 stroke=%22%23ffffff%22 stroke-width=%221.8%22/><line x1=%222%22 y1=%2216%22 x2=%2230%22 y2=%2216%22 stroke=%22%23ffffff%22 stroke-width=%221.8%22/><line x1=%225.5%22 y1=%229%22 x2=%2226.5%22 y2=%229%22 stroke=%22%23ffffff%22 stroke-width=%221.5%22 stroke-linecap=%22round%22/><line x1=%225.5%22 y1=%2223%22 x2=%2226.5%22 y2=%2223%22 stroke=%22%23ffffff%22 stroke-width=%221.5%22 stroke-linecap=%22round%22/><circle cx=%2222%22 cy=%2210%22 r=%222.5%22 fill=%22%2356d364%22/></svg>",
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
