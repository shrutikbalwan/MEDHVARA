import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MEDHVARA",
  description: "MEDHVARA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* Browser extensions (e.g. ColorZilla) mutate <body> before hydration;
          suppress the resulting attribute mismatch warning on this element only. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
