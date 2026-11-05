import { Suspense } from "react";
import TopNav from "@/components/top-nav";
import NewPortfolio from "./new-portfolio";

export default function NewPage() {
  return (
    <>
      <TopNav />
      {/* האשף קורא פרמטרים מהכתובת (?blind=1), ולכן הוא בתוך Suspense */}
      <Suspense fallback={<main className="max-w-5xl mx-auto p-6 text-muted">טוען…</main>}>
        <NewPortfolio />
      </Suspense>
    </>
  );
}
