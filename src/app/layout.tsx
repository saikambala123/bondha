import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ApplyPilot — AI Job Application Autofill",
  description:
    "AI-powered web portal + Chrome extension that auto-fills job applications on Workday, Greenhouse, Lever and 20+ ATS platforms. Parses your resume with Gemini, detects and fixes form errors automatically.",
  keywords: ["AI autofill", "job applications", "Workday", "Greenhouse", "Gemini", "resume parser", "Chrome extension"],
  icons: {
    icon: "/extension/icons/icon128.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
