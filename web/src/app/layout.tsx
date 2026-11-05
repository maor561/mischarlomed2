import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import SwRegister from "@/components/sw-register";
import "./globals.css";

const rubik = Rubik({ variable: "--font-rubik", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "מסחר־לומד",
  description: "סימולטור השקעות ללימוד: נתוני שוק אמיתיים, כסף וירטואלי",
  applicationName: "מסחר־לומד",
  // אייפון: אחרי "הוסף למסך הבית" נפתח כאפליקציה מלאה, בלי Safari מסביב
  appleWebApp: { capable: true, title: "מסחר־לומד", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#2753d6", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
