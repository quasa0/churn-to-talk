import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Churn Recovery Agent",
  description: "Review and send founder-voice recovery emails for churned fastclip.it users."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
