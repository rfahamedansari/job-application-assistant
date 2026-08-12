import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import AppSidebar from "@/components/AppSidebar";
import TopLogout from "@/components/TopLogout";
import RegisterServiceWorker from "./register-sw";

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
  title: "Ahamed AI Career OS",
  description:
    "AI-powered job search, resume matching, ATS analysis, applications and interview preparation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950">
        <RegisterServiceWorker />

        <AppSidebar />

        <TopLogout />

        <main className="min-h-screen lg:pl-72">
          {children}
        </main>
      </body>
    </html>
  );
}