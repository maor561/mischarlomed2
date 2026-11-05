import { Suspense } from "react";
import TopNav from "@/components/top-nav";
import PortfolioRoute from "./portfolio-route";

// דף דינמי (מזהה תיק בכתובת): עוטפים ב-Suspense כדי שהמעטפת תוגש מיד
export default function PortfolioPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto p-6 text-muted">טוען…</main>}>
      <TopNav />
      <PortfolioRoute />
    </Suspense>
  );
}
