import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/bottom-nav";
import PageWrapper from "@/components/page-wrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Henderson Family Hub",
  description: "Family budgeting and calendar app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased bg-[#F8FAFC] text-slate-900`}
      >
        <PageWrapper>{children}</PageWrapper>
        <BottomNav />
      </body>
    </html>
  );
}
