import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({ variable: "--font-rubik", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "מסחר־לומד",
  description: "סימולטור השקעות ללימוד: נתוני שוק אמיתיים, כסף וירטואלי",
};

export const viewport: Viewport = { themeColor: "#2753d6" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
