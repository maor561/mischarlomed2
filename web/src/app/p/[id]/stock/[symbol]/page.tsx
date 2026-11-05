import { Suspense } from "react";
import TopNav from "@/components/top-nav";
import StockScreen from "./stock-screen";

export default function StockPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto p-6 text-muted">טוען…</main>}>
      <TopNav />
      <StockScreen />
    </Suspense>
  );
}
