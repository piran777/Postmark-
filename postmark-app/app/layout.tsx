import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/components/ui/toaster";
import { ThemeToggle } from "@/components/theme-toggle";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Postmark – Unified Mail",
  description: "A calm, modern unified inbox for busy professionals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    (() => {
      try {
        const stored = localStorage.getItem("theme");
        const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        const theme = stored === "light" || stored === "dark" ? stored : system;
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.add("theme-ready");
      } catch (e) {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.classList.add("theme-ready");
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-prefers"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {/* Keep theme toggle accessible but out of the way of page headers */}
          <div className="fixed bottom-4 right-4 z-40">
            <ThemeToggle />
          </div>
        {children}
          <AppToaster />
        </Providers>
      </body>
    </html>
  );
}
