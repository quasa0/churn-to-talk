import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recovery Desk · fastclip.it",
  description: "Founder-reviewed churn recovery drafts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
